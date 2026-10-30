// 中継を並列に持つ（Nostr型）。送る側は同じ封筒を全部の中継に置き、受ける側は全部から取る。
// どれか1つ生きていれば届く。封筒は署名・E2E 済みで、重複は envelope_id で手元が捨てるので、
// 中継どうしの合意は要らない（大川さん決定 2026-10-29。縁ごとの振り分けは採らない＝1つ落ちると止まるため）。
//
// 住所の一覧 = MM_RELAY_URL（従来どおり。空白・カンマ区切りで複数も可）＋ <BUMP_HOME>/relays.txt（1行1つ）。
// ファイルは毎回読むので、MCP や launchd を登録し直さなくても中継を足せる。
// カーソルは中継ごと。従来の1中継時代のカーソルは、最初の中継の分として引き継ぐ。

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, identityPath } from './paths.js';
import { makeGetClaim } from './crypto.js';
import { warn } from './log.js';
import { readJson, writeJson } from './store.js';

export const relaysFile = () => join(root(), 'relays.txt');
export const normUrl = (u) => String(u || '').trim().replace(/\/+$/, '');
export const okUrl = (u) => /^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(u);

export function relayUrls() {
  const env = String(process.env.MM_RELAY_URL || '').split(/[\s,]+/);
  let file = [];
  try { file = readFileSync(relaysFile(), 'utf8').split('\n').map((s) => s.replace(/#.*/, '')); } catch {}
  const out = [];
  for (const u of [...env, ...file].map(normUrl)) if (okUrl(u) && !out.includes(u)) out.push(u);
  return out;
}

const TIMEOUT_MS = 15_000;   // 1つの中継が固まっても、常駐や画面を道連れにしない

export async function relayPost(url, path, body) {
  const r = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`relay ${path.slice(1)} ${r.status}`);
  return r.json().catch(() => ({}));
}

// 受信箱を読む。自分の鍵で署名した要求を添えて、持ち主だと示す（全部の中継に同じく付ける）。
// 鍵が読めない・宛先が自分でない時は署名なしで頼む（中継が署名必須になるまでの移行期間はそれで通る）。
let identityCache;
async function relayGet(url, myDeviceId, after) {
  const headers = {};
  try {
    identityCache ||= await readJson(identityPath());
    if (identityCache.device_id === myDeviceId)
      headers['x-bump-auth'] = Buffer.from(JSON.stringify(makeGetClaim(identityCache, new Date().toISOString()))).toString('base64');
  } catch {}
  const res = await fetch(`${url}/get?routing_id=${encodeURIComponent(myDeviceId)}&after=${after}`,
    { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`relay get ${res.status}`);
  return res.json();
}

// 中継ごとのカーソル。cursorFile = { [url]: n }。まだ無ければ、最初の中継に限って旧カーソル（legacy）を引き継ぐ。
async function readCursor(cursorFile, url, primary, legacy) {
  let m = null; try { m = await readJson(cursorFile); } catch {}
  if (m && typeof m[url] === 'number') return m[url];
  if (!m && url === primary && legacy) { try { return (await legacy()) || 0; } catch {} }
  return 0;
}
async function writeCursor(cursorFile, url, n) {
  let m = {}; try { m = (await readJson(cursorFile)) || {}; } catch {}
  m[url] = n; await writeJson(cursorFile, m);
}

// 全部の中継から自分宛を取り、封筒ごとに onItem(envelope, url) を呼ぶ。中継ごとに続きから読む。
// 1つでも読めれば成功。全部だめなら最後の失敗を投げる（呼び出し側は今までどおり握る）。
export async function eachRelayBox({ myDeviceId, cursorFile, legacy, onItem }) {
  const urls = relayUrls();
  let ok = 0, lastErr = null;
  for (const url of urls) {
    try {
      let cursor = await readCursor(cursorFile, url, urls[0], legacy);
      let { items, cursor: next, max } = await relayGet(url, myDeviceId, cursor);
      // 中継の受信箱が巻き戻ったとき（TTLで空になり番号が振り直された等）、こちらのカーソルだけが
      // 先にいて、空の応答を受け取り続け配達が黙って止まる（2026-08-12 実発生＝Y.K.報告）。中継ごとに見る。
      if (typeof max === 'number' && cursor > max) {
        warn('中継の受信箱が巻き戻っていました。取り直します', new Error(`${url}: cursor ${cursor} > relay max ${max}`));
        ({ items, cursor: next, max } = await relayGet(url, myDeviceId, 0));
      }
      for (const it of items || []) await onItem(it && it.envelope, url, it || {});
      if (typeof next === 'number') await writeCursor(cursorFile, url, next);
      ok++;
    } catch (e) { lastErr = e; }
  }
  if (!ok && lastErr) throw lastErr;
  return ok;
}

// relays.txt の編集（bump relays add|remove）。MM_RELAY_URL 由来の住所はファイルからは外せない（launch.sh 側で管理）。
export async function editRelays(op, url) {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(root(), { recursive: true });   // 入れたばかりで ~/.bump がまだ無くても書ける
  const u = normUrl(url);
  if (!okUrl(u)) throw new Error(`not a relay URL: ${url}`);
  let lines = []; try { lines = (await readFile(relaysFile(), 'utf8')).split('\n').map(normUrl).filter(Boolean); } catch {}
  if (op === 'add' && !lines.includes(u)) lines.push(u);
  if (op === 'remove') lines = lines.filter((x) => x !== u);
  await writeFile(relaysFile(), lines.length ? lines.join('\n') + '\n' : '', 'utf8');
  return relayUrls();
}

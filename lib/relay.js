// ローカル目隠し中継。将来の tailscale/ネット越し中継の原型。
// 中継が持つのは routing_id（宛先device_id）と暗号文だけ。平文には触れない。
// レイアウト: <relayDir>/<pair_id>/<to_routing_id>/<envelope_id>.env.json
// store-and-forward: pull した側が取り出す（消費）。

import { mkdir, copyFile, rename, readdir, unlink, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pairPaths, root } from './paths.js';
import { listBox, readJson, writeJson } from './store.js';

// MM_RELAY_URL があればネット越しの目隠し中継(HTTP)、無ければローカルフォルダ。
// routing_id は当面 device_id（近く256bitランダムに格上げ予定＝codex推奨）。
const relayUrl = () => process.env.MM_RELAY_URL;

function mailbox(relayDir, pairId, routingId) {
  return join(relayDir, pairId, routingId);
}
function cursorPath(pairId) { return join(pairPaths(pairId).base, 'cursor.json'); }

// outbox の封筒を相手のmailboxへ投函。投函済みは outbox で .pushed に退避。
export async function pushToRelay({ pairId, relayDir, peerDeviceId }) {
  const p = pairPaths(pairId);
  const files = await listBox(p.outbox, '.env.json');
  const url = relayUrl();
  let n = 0;
  for (const f of files) {
    const env = await readJson(join(p.outbox, f));
    if (url) {
      const r = await fetch(url.replace(/\/$/, '') + '/put', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to_routing_id: peerDeviceId, envelope: env }) });
      if (!r.ok) throw new Error(`relay put ${r.status}`);
    } else {
      const box = mailbox(relayDir, pairId, peerDeviceId);
      await mkdir(box, { recursive: true });
      await copyFile(join(p.outbox, f), join(box, f));
    }
    await rename(join(p.outbox, f), join(p.outbox, f + '.pushed')).catch(() => {});
    n++;
  }
  return n;
}

// --- 接続リクエスト（まだ縁がない相手からの申請）専用の口 -------------------
// 縁が無い＝共有鍵が無いので暗号化できない。中身は「署名付き平文バンドル」（招待QRと同じ性質）。
// relayの封筒形（envelope_id + ciphertext）に乗せて運ぶだけ。kind で通常の手紙と区別する。
export const CONNECT_KIND = 'mm-connect';
function connectCursorPath() { return join(root(), 'connect-cursor.json'); }

// 申請を相手の受信箱へ投函（送る側＝新規参加者）。relayDir はローカル実験用フォールバック。
export async function postConnectRequest({ relayDir, toDeviceId, envelopeId, payload }) {
  const env = { envelope_id: envelopeId, ciphertext: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'), kind: CONNECT_KIND };
  const url = relayUrl();
  if (url) {
    const r = await fetch(url.replace(/\/$/, '') + '/put', { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to_routing_id: toDeviceId, envelope: env }) });
    if (!r.ok) throw new Error(`relay put ${r.status}`);
    return true;
  }
  const box = mailbox(relayDir, 'connect', toDeviceId);
  await mkdir(box, { recursive: true });
  await writeFile(join(box, `${envelopeId}.env.json`), JSON.stringify(env), 'utf8');
  return true;
}

// 自分宛の接続申請を取り出す（受ける側）。縁ごとのcursorとは別の専用cursorを使う。
export async function pullConnectRequests({ relayDir, myDeviceId }) {
  const url = relayUrl();
  const out = [];
  if (url) {
    let cursor = 0;
    try { cursor = (await readJson(connectCursorPath())).cursor || 0; } catch {}
    const r = await fetch(`${url.replace(/\/$/, '')}/get?routing_id=${encodeURIComponent(myDeviceId)}&after=${cursor}`);
    if (!r.ok) throw new Error(`relay get ${r.status}`);
    const { items, cursor: next } = await r.json();
    for (const it of items) {
      const env = it.envelope;
      if (!env || env.kind !== CONNECT_KIND) continue; // 通常の手紙は縁ごとのpullに任せる
      try { out.push(JSON.parse(Buffer.from(env.ciphertext, 'base64').toString('utf8'))); } catch {}
    }
    if (typeof next === 'number') await writeJson(connectCursorPath(), { cursor: next });
    return out;
  }
  const box = mailbox(relayDir, 'connect', myDeviceId);
  let files = [];
  try { files = (await readdir(box)).filter((n) => n.endsWith('.env.json')); } catch { return out; }
  for (const f of files) {
    try { const env = await readJson(join(box, f));
      if (env.kind === CONNECT_KIND) out.push(JSON.parse(Buffer.from(env.ciphertext, 'base64').toString('utf8'))); } catch {}
    await unlink(join(box, f)).catch(() => {});
  }
  return out;
}

// relayの受信箱は「自分宛」の1つなので、取り込みも1回で済ませて差出人ごとに振り分ける。
// 縁ごとにpullすると、各縁が全員分の封筒を拾って弾く（＝人数分の無駄と、監査ログがその
// 拒否記録で埋まる。実測で83%がこのノイズだった 2026-07-27）。cursorも1つに統一する。
// peersOf: device_id → pairId の対応。未知の差出人の封筒は置かない（接続リクエストは別経路）。
function allCursorPath() { return join(root(), 'inbox-cursor.json'); }

export async function pullAllFromRelay({ relayDir, myDeviceId, peersOf }) {
  const url = relayUrl();
  const placed = {};                        // pairId → 置いた件数
  const put = async (pairId, env) => {
    await writeFile(join(pairPaths(pairId).inbox, `${env.envelope_id}.env.json`), JSON.stringify(env, null, 2), 'utf8');
    placed[pairId] = (placed[pairId] || 0) + 1;
  };
  if (url) {
    let cursor = 0;
    try { cursor = (await readJson(allCursorPath())).cursor || 0; } catch {
      // 初回のみ：縁ごとの古いcursorの最大値から始める（過去分の再取得を避ける）。
      for (const pairId of Object.values(peersOf)) {
        try { const c = (await readJson(cursorPath(pairId))).cursor || 0; if (c > cursor) cursor = c; } catch {}
      }
    }
    const r = await fetch(`${url.replace(/\/$/, '')}/get?routing_id=${encodeURIComponent(myDeviceId)}&after=${cursor}`);
    if (!r.ok) throw new Error(`relay get ${r.status}`);
    const { items, cursor: next } = await r.json();
    for (const it of items) {
      const env = it.envelope;
      if (!env || env.kind === CONNECT_KIND) continue;   // 接続リクエストは専用の口で処理する
      const pairId = peersOf[env.from];
      if (!pairId) continue;                             // 知らない相手＝置かない（黙って捨てる）
      await put(pairId, env);
    }
    if (typeof next === 'number') await writeJson(allCursorPath(), { cursor: next });
    return placed;
  }
  // ローカルフォルダ運用（実験用）。縁ごとのmailboxを順に消費する。
  for (const [dev, pairId] of Object.entries(peersOf)) {
    const box = mailbox(relayDir, pairId, myDeviceId);
    let files = [];
    try { files = (await readdir(box)).filter((n) => n.endsWith('.env.json')); } catch { continue; }
    for (const f of files) {
      await copyFile(join(box, f), join(pairPaths(pairId).inbox, f));
      await unlink(join(box, f)).catch(() => {});
      placed[pairId] = (placed[pairId] || 0) + 1;
    }
  }
  return placed;
}

// 自分宛の封筒を inbox へ取り込む（1つの縁だけ・CLIのsync用）。
// HTTPはカーソル方式（中継は消さない）、フォルダは消費。
export async function pullFromRelay({ pairId, relayDir, myDeviceId, peerDeviceId }) {
  const p = pairPaths(pairId);
  const url = relayUrl();
  if (url) {
    let cursor = 0;
    try { cursor = (await readJson(cursorPath(pairId))).cursor || 0; } catch {}
    const r = await fetch(`${url.replace(/\/$/, '')}/get?routing_id=${encodeURIComponent(myDeviceId)}&after=${cursor}`);
    if (!r.ok) throw new Error(`relay get ${r.status}`);
    const { items, cursor: next } = await r.json();
    let n = 0;
    for (const it of items) {
      const env = it.envelope;
      if (!env || env.kind === CONNECT_KIND) continue;                  // 接続リクエストは別経路
      if (peerDeviceId && env.from !== peerDeviceId) continue;          // 別の縁の封筒は置かない
      await writeFile(join(p.inbox, `${env.envelope_id}.env.json`), JSON.stringify(env, null, 2), 'utf8');
      n++;
    }
    if (typeof next === 'number') await writeJson(cursorPath(pairId), { cursor: next });
    return n;
  }
  const box = mailbox(relayDir, pairId, myDeviceId);
  let files = [];
  try { files = (await readdir(box)).filter((n) => n.endsWith('.env.json')); } catch { return 0; }
  let n = 0;
  for (const f of files) {
    await copyFile(join(box, f), join(p.inbox, f));
    await unlink(join(box, f)).catch(() => {});
    n++;
  }
  return n;
}

// 目隠し中継とのやり取り（投函・取り込み・取り消し・接続リクエスト）。
// 中継が持つのは routing_id（宛先device_id）と暗号文だけ。平文には触れない。
// 中継は並列に複数持てる（lib/relays.js）。送るときは全部に置き、受けるときは全部から取る。
// 中継の住所が1つも無ければローカルフォルダ（実験用）: <relayDir>/<pair_id>/<to_routing_id>/<envelope_id>.env.json

import { mkdir, copyFile, rename, readdir, unlink, writeFile, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pairPaths, root } from './paths.js';
import { listBox, readJson, writeJson } from './store.js';
import { relayUrls, relayPost, eachRelayBox } from './relays.js';

function mailbox(relayDir, pairId, routingId) {
  return join(relayDir, pairId, routingId);
}
function cursorPath(pairId) { return join(pairPaths(pairId).base, 'cursor.json'); }   // 1中継時代のカーソル
const TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 中継の保持期限。これを過ぎた再送は打ち切る

// どの中継に置けたかの控え（封筒ごと）。取り消しはここに書かれた中継に送る。
const placedPath = (outbox, envelopeId) => join(outbox, `${envelopeId}.relays.json`);
export async function placedRelays(pairId, envelopeId) {
  try { const a = await readJson(placedPath(pairPaths(pairId).outbox, envelopeId)); return Array.isArray(a) ? a : null; } catch { return null; }
}

// outbox の封筒を全部の中継へ投函する。1つでも置けたらその封筒は送信成功。
// 全部に置けたら .pushed に退避。置けなかった中継の分は outbox に残り、常駐が後で投函し直す。
// どの中継にも置けなかった封筒があれば投げる（呼び出し側の「送信失敗」表示は従来どおり）。
export async function pushToRelay({ pairId, relayDir, peerDeviceId }) {
  const p = pairPaths(pairId);
  const files = await listBox(p.outbox, '.env.json');
  const urls = relayUrls();
  let n = 0, failed = 0;
  for (const f of files) {
    const src = join(p.outbox, f);
    if (!urls.length) {
      const box = mailbox(relayDir, pairId, peerDeviceId);
      await mkdir(box, { recursive: true });
      await copyFile(src, join(box, f));
      await rename(src, src + '.pushed').catch(() => {});
      n++; continue;
    }
    const env = await readJson(src);
    const side = placedPath(p.outbox, env.envelope_id);
    let done = []; try { done = (await readJson(side)) || []; } catch {}
    const before = done.length;
    for (const url of urls) {
      if (done.includes(url)) continue;
      try { await relayPost(url, '/put', { to_routing_id: peerDeviceId, envelope: env }); done.push(url); } catch {}
    }
    if (done.length > before) await writeJson(side, done);
    if (!done.length) { failed++; continue; }
    if (!before) n++;
    let old = false; try { old = Date.now() - (await stat(src)).mtimeMs > TTL_MS; } catch {}
    if (urls.every((u) => done.includes(u)) || old) await rename(src, src + '.pushed').catch(() => {});
  }
  if (failed) throw new Error(`relay put failed (${failed})`);
  return n;
}

// 送信取り消し：置けた中継の全部に、差出人の署名付き要求で取り除くよう頼む。全部で消えた時だけ removed。
// 取り消せるのは配達前（相手がpullする前）だけ。控えの無い古い封筒は最初の中継にだけ置いたものとして扱う。
export async function unsendFromRelay({ pairId, relayDir, peerDeviceId, claim }) {
  const urls = relayUrls();
  if (urls.length) {
    const placed = (await placedRelays(pairId, claim.envelope_id)) || urls.slice(0, 1);
    let all = placed.length > 0;
    for (const url of placed) {
      try { if (!(await relayPost(url, '/unsend', { to_routing_id: peerDeviceId, claim })).removed) all = false; }
      catch { all = false; }
    }
    return { removed: all };
  }
  const f = join(mailbox(relayDir, pairId, peerDeviceId), `${claim.envelope_id}.env.json`);
  try { await unlink(f); return { removed: true }; } catch { return { removed: false }; }
}

// --- 接続リクエスト（まだ縁がない相手からの申請）専用の口 -------------------
// 縁が無い＝共有鍵が無いので暗号化できない。中身は「署名付き平文バンドル」（招待QRと同じ性質）。
// relayの封筒形（envelope_id + ciphertext）に乗せて運ぶだけ。kind で通常の手紙と区別する。
export const CONNECT_KIND = 'mm-connect';
function connectCursorPath() { return join(root(), 'connect-cursor.json'); }
const connectSeenPath = () => join(root(), 'connect-seen.json');

// 申請を全部の中継へ投函（送る側＝新規参加者）。1つでも置ければ成功。relayDir はローカル実験用。
export async function postConnectRequest({ relayDir, toDeviceId, envelopeId, payload }) {
  const env = { envelope_id: envelopeId, ciphertext: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'), kind: CONNECT_KIND };
  const urls = relayUrls();
  if (urls.length) {
    let ok = 0, lastErr = null;
    for (const url of urls) {
      try { await relayPost(url, '/put', { to_routing_id: toDeviceId, envelope: env }); ok++; } catch (e) { lastErr = e; }
    }
    if (!ok) throw lastErr;
    return true;
  }
  const box = mailbox(relayDir, 'connect', toDeviceId);
  await mkdir(box, { recursive: true });
  await writeFile(join(box, `${envelopeId}.env.json`), JSON.stringify(env), 'utf8');
  return true;
}

// 同じ申請は中継の数だけ、また受信箱の取り込みと申請の口の両方から来るので、見た封筒の id を
// 控えて2度目以降は捨てる（承認済みの申請が遅れて並び直さないように）。
async function connectSeen() {
  let seen = []; try { seen = (await readJson(connectSeenPath())) || []; } catch {}
  const n0 = seen.length;
  return {
    fresh: (env) => { if (typeof env.envelope_id !== 'string') return true; if (seen.includes(env.envelope_id)) return false; seen.push(env.envelope_id); return true; },
    save: async () => { if (seen.length > n0) await writeJson(connectSeenPath(), seen.slice(-2000)); },
  };
}
const connectPayload = (env) => { try { return JSON.parse(Buffer.from(env.ciphertext, 'base64').toString('utf8')); } catch { return null; } };

// 自分宛の接続申請を全部の中継から取り出す（受ける側）。同じ申請は中継の数だけ届くので、
// 見た封筒の id を控えて2度目以降は捨てる（承認済みの申請が別の中継から遅れて並び直さないように）。
export async function pullConnectRequests({ relayDir, myDeviceId }) {
  const out = [];
  if (relayUrls().length) {
    const seen = await connectSeen();
    await eachRelayBox({ myDeviceId, cursorFile: join(root(), 'relay-cursors.connect.json'),
      legacy: async () => (await readJson(connectCursorPath())).cursor,
      onItem: async (env) => {
        if (!env || env.kind !== CONNECT_KIND) return;   // 通常の手紙は受信箱の取り込みに任せる
        if (!seen.fresh(env)) return;
        const b = connectPayload(env); if (b) out.push(b);
      } });
    await seen.save();
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

// 中継から来た封筒のうち、ファイル名にしてよい形のものだけを置く。envelope_id は送り手が
// 好きに書ける平文で、中継は自分のファイル名にしか safeId をかけない。'../' 入りを素通しすると
// 受信箱の外に .env.json が作られる（2026-10-25 監査 run-1）。本物は randomUUID なので必ず通る。
const SAFE_ENVELOPE_ID = /^[A-Za-z0-9_-]{1,80}$/;
function placeable(env) {
  return !!env && typeof env === 'object' && typeof env.from === 'string'
    && typeof env.envelope_id === 'string' && SAFE_ENVELOPE_ID.test(env.envelope_id);
}

// この封筒は既に手元にあるか。未処理の .env.json だけでなく、取り込み済みの名残
// （.done/.dup/.rejected）も「ある」と数える。同じ封筒は中継の数だけ、また巻き戻り復旧の
// 取り直しでも届くので、置き直すと復号やり直しのムダと件数の数えすぎ（K.S.指摘 2026-08-20）が出る。
async function alreadyHave(inboxDir, envelopeId) {
  for (const suf of ['', '.done', '.dup', '.rejected']) {
    try { await stat(join(inboxDir, `${envelopeId}.env.json${suf}`)); return true; } catch {}
  }
  return false;
}

// 縁がまだ無い相手からの封筒は、捨てずに少しのあいだ預かる。招待リンクを開いた人は、相手の側で
// 縁ができる前に手紙を書けてしまい、以前はそれが黙って捨てられていた（2026-10-30 実測）。
// 縁ができたら replayStrays で受信箱へ戻す。誰でも投函できる口なので、件数・大きさ・日数に上限を置く。
const strayDir = () => join(root(), 'stray');
const STRAY_MAX = 200, STRAY_MAX_BYTES = 256 * 1024, STRAY_DAYS = 7;
async function stashStray(env) {
  const body = JSON.stringify(env);
  if (body.length > STRAY_MAX_BYTES) return;
  await mkdir(strayDir(), { recursive: true });
  let files = (await readdir(strayDir()).catch(() => [])).filter((f) => f.endsWith('.env.json'));
  const old = Date.now() - STRAY_DAYS * 86400_000;
  for (const f of files) { try { if ((await stat(join(strayDir(), f))).mtimeMs < old) await unlink(join(strayDir(), f)); } catch {} }
  files = (await readdir(strayDir()).catch(() => [])).filter((f) => f.endsWith('.env.json'));
  if (files.length >= STRAY_MAX) return;
  await writeFile(join(strayDir(), `${env.envelope_id}.env.json`), body, 'utf8');
}
// 縁ができた相手（deviceId）から預かっていた封筒を、その縁の受信箱へ移す。移した件数を返す。
export async function replayStrays(pairId, deviceId) {
  let n = 0;
  for (const f of (await readdir(strayDir()).catch(() => [])).filter((x) => x.endsWith('.env.json'))) {
    try {
      const env = JSON.parse(await readFile(join(strayDir(), f), 'utf8'));
      if (env.from !== deviceId) continue;
      const inbox = pairPaths(pairId).inbox;
      if (!(await alreadyHave(inbox, env.envelope_id))) { await writeFile(join(inbox, f), JSON.stringify(env, null, 2), 'utf8'); n++; }
      await unlink(join(strayDir(), f));
    } catch {}
  }
  return n;
}

// relayの受信箱は「自分宛」の1つなので、取り込みも1回で済ませて差出人ごとに振り分ける。
// 縁ごとにpullすると、各縁が全員分の封筒を拾って弾く（＝人数分の無駄と、監査ログがその
// 拒否記録で埋まる。実測で83%がこのノイズだった 2026-07-27）。
// peersOf: device_id → pairId の対応。未知の差出人の封筒は置かない（接続リクエストは別経路）。
function allCursorPath() { return join(root(), 'inbox-cursor.json'); }

// onConnect: 同じ受信箱に来た接続リクエストを、ここで一緒に拾う（申請のために中継へもう一度行かない）。
export async function pullAllFromRelay({ relayDir, myDeviceId, peersOf, onConnect }) {
  const placed = {};                        // pairId → 新しく置いた件数
  if (relayUrls().length) {
    const seen = onConnect ? await connectSeen() : null;
    // 1中継時代のカーソル。それも無ければ縁ごとの古いcursorの最大値から（過去分の再取得を避ける）。
    const legacy = async () => {
      try { return (await readJson(allCursorPath())).cursor || 0; } catch {}
      let c = 0;
      for (const pairId of Object.values(peersOf)) { try { c = Math.max(c, (await readJson(cursorPath(pairId))).cursor || 0); } catch {} }
      return c;
    };
    await eachRelayBox({ myDeviceId, cursorFile: join(root(), 'relay-cursors.inbox.json'), legacy,
      onItem: async (env) => {
        if (!env) return;
        if (env.kind === CONNECT_KIND) {                 // 接続リクエスト
          if (onConnect && seen.fresh(env)) { const b = connectPayload(env); if (b) await onConnect(b); }
          return;
        }
        if (!placeable(env)) return;                     // 形の怪しい封筒は置かない
        // 自分で登録した相手だけを引く。peersOf['__proto__'] のような継承された名前を縁と取り違えると
        // path.join が投げてカーソルが進まず、以後の受信が止まる（2026-10-25 監査 run-1）。
        const pairId = Object.hasOwn(peersOf, env.from) ? peersOf[env.from] : undefined;
        if (typeof pairId !== 'string') { await stashStray(env); return; }   // 縁がまだ無い相手＝預かる
        const inboxDir = pairPaths(pairId).inbox;
        if (await alreadyHave(inboxDir, env.envelope_id)) return;
        await writeFile(join(inboxDir, `${env.envelope_id}.env.json`), JSON.stringify(env, null, 2), 'utf8');
        placed[pairId] = (placed[pairId] || 0) + 1;
      } });
    if (seen) await seen.save();
    return placed;
  }
  // ローカルフォルダ運用（実験用）。縁ごとのmailboxを順に消費する。
  for (const [, pairId] of Object.entries(peersOf)) {
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
  if (relayUrls().length) {
    let n = 0;
    await eachRelayBox({ myDeviceId, cursorFile: join(p.base, 'relay-cursors.json'),
      legacy: async () => (await readJson(cursorPath(pairId))).cursor,
      onItem: async (env) => {
        if (!env || env.kind === CONNECT_KIND) return;                  // 接続リクエストは別経路
        if (!placeable(env)) return;                                    // 形の怪しい封筒は置かない
        if (peerDeviceId && env.from !== peerDeviceId) return;          // 別の縁の封筒は置かない
        if (await alreadyHave(p.inbox, env.envelope_id)) return;        // 他の中継・取り直しの既知分は数えない
        await writeFile(join(p.inbox, `${env.envelope_id}.env.json`), JSON.stringify(env, null, 2), 'utf8');
        n++;
      } });
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

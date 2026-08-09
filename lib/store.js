// ファイルベースの郵便箱＋ハッシュ連鎖 append-only ログ。
// 中央ストア無し。各エンドが自分の履歴を持つ（invariant 3）。
// ログ実体＝監査。ファイル(封筒)は配送物にすぎず、監査の主はログ（codexレビュー反映）。

import { mkdir, appendFile, readFile, writeFile, readdir, access, open, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pairPaths, pairsDir } from './paths.js';
import { sha256Hex, canonical } from './crypto.js';

// ペアのディレクトリ一式を用意（冪等）。
export async function ensurePair(pairId) {
  const p = pairPaths(pairId);
  await mkdir(p.outbox, { recursive: true });
  await mkdir(p.inbox, { recursive: true });
  await mkdir(p.messages, { recursive: true });
  return p;
}

// --- append-only ハッシュ連鎖ログ ------------------------------------------
// event 状態: created|sent|received|acked|read、および pairing/verify 系。
// 各行 hash = sha256(prev_hash + canonical(core))。prev_hash はローカル用途のみ
// （相手との全順序は作らない）。

export async function readLog(pairId) {
  const p = pairPaths(pairId);
  let text = '';
  try { text = await readFile(p.log, 'utf8'); } catch { return []; }
  return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// 末尾1行だけを読む（連鎖の続きを O(1) パースで得る。全行パースしない）。
async function lastEvent(pairId) {
  let text = '';
  try { text = await readFile(pairPaths(pairId).log, 'utf8'); } catch { return null; }
  const nl = text.replace(/\n+$/, '').lastIndexOf('\n');
  const line = text.slice(nl + 1).trim();
  return line ? JSON.parse(line) : null;
}

// プロセス跨ぎの排他ロック（同じ縁への並行追記で連鎖が分岐するのを防ぐ）。
async function withLock(pairId, fn) {
  const lock = join(pairPaths(pairId).base, '.log.lock');
  for (let i = 0; i < 100; i++) {
    try {
      const fh = await open(lock, 'wx');
      try { return await fn(); } finally { await fh.close(); await unlink(lock).catch(() => {}); }
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // 5秒以上前の残骸ロックは奪う（クラッシュ耐性）。
      try { const st = await stat(lock); if (Date.now() - st.mtimeMs > 5000) await unlink(lock).catch(() => {}); } catch {}
      await new Promise((r) => setTimeout(r, 20 + i));
    }
  }
  throw new Error('log lock timeout');
}

export async function logEvent(pairId, event, nowIso) {
  return withLock(pairId, async () => {
    const prev = await lastEvent(pairId);
    const prev_hash = prev ? prev.hash : '';
    const seq = prev ? prev.seq + 1 : 0;
    const core = { seq, ts: nowIso, ...event };
    const hash = sha256Hex(prev_hash + canonical(core));
    await appendFile(pairPaths(pairId).log, JSON.stringify({ ...core, prev_hash, hash }) + '\n', 'utf8');
    return hash;
  });
}

// ログのハッシュ連鎖を検証（改竄検知）。
export function verifyLog(entries) {
  let prev = '';
  for (let i = 0; i < entries.length; i++) {
    const { prev_hash, hash, ...core } = entries[i];
    if (prev_hash !== prev) return { ok: false, at: i, reason: 'prev_hash mismatch' };
    if (sha256Hex(prev + canonical(core)) !== hash) return { ok: false, at: i, reason: 'hash mismatch' };
    prev = hash;
  }
  return { ok: true, count: entries.length };
}

// --- peer.json --------------------------------------------------------------

export async function readPeer(pairId) {
  return JSON.parse(await readFile(pairPaths(pairId).peer, 'utf8'));
}

export async function writePeer(pairId, peer) {
  await writeFile(pairPaths(pairId).peer, JSON.stringify(peer, null, 2) + '\n', 'utf8');
}

export async function hasPeer(pairId) {
  try { await access(pairPaths(pairId).peer); return true; } catch { return false; }
}

// --- ボックス（封筒・メッセージ） ------------------------------------------

export async function listPairs() {
  try {
    return (await readdir(pairsDir(), { withFileTypes: true }))
      .filter((d) => d.isDirectory()).map((d) => d.name);
  } catch { return []; }
}

export async function listBox(dir, ext = '.json') {
  try {
    return (await readdir(dir)).filter((n) => n.endsWith(ext)).sort();
  } catch { return []; }
}

export async function writeJson(path, obj) {
  await writeFile(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

// message_id で冪等（再送・重複受信を吸収）。既存なら false。
export async function messageExists(pairId, messageId) {
  const p = pairPaths(pairId);
  try { await access(join(p.messages, `${messageId}.msg.json`)); return true; } catch { return false; }
}

export { join };

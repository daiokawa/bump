#!/usr/bin/env node
// 目隠し受信箱サーバ（HTTP store-and-forward）。離れた2台を繋ぐ「間の場所」。
// 中継が扱うのは routing_id（宛先device_id）と暗号文(envelope)だけ。平文・本人性・
// 会話グラフには触れない＝「攻めるべきサーバがない」。
//
// ★ディスク永続（重要）: 連番(seq)と在中の封筒をディスクに持つ。
//   → 再起動しても seq が巻き戻らない（受信側cursorとの desync＝黙って配達が壊れる を防ぐ）
//   → 再起動でも在中の手紙が消えない（喫茶店が一瞬閉まっても手紙は残る）
// レイアウト: <BOX>/<routing_id>/<seq12>__<envelope_id>.json
// 起動: node server/relay-server.js [port]   保存先: MM_RELAYBOX か既定 ~/.middleman/relaybox
// codexレビュー反映: カーソル方式(非破壊)・冪等(id重複は無視)・サイズ/件数/TTL/rate・空でも200。

import { createServer } from 'node:http';
import { mkdir, readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { hasRoom, freeBytes, humanBytes } from '../lib/disk.js';

const PORT = Number(process.argv[2]) || 8791;
const BOX = process.env.MM_RELAYBOX || join(process.env.MIDDLEMAN_HOME || join(homedir(), '.middleman'), 'relaybox');
const MAX_ENV_BYTES = 1024 * 1024;     // envelope 1件の上限（seed=ソフト配布を載せるため1MB。2026-07-26）
const MAX_PER_ROUTING = 500;           // routing_id ごとの保持件数（超えたら古いものから消す）
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 保持期間（相手が長く寝ていても届くよう1週間）
const RATE_MAX = 240, RATE_WINDOW_MS = 60 * 1000;

const rate = new Map();
const nowMs = () => Date.now();
function rateOk(ip) { const t = nowMs(); let r = rate.get(ip); if (!r || r.resetAt < t) { r = { count: 0, resetAt: t + RATE_WINDOW_MS }; rate.set(ip, r); } r.count++; return r.count <= RATE_MAX; }
// 宛先(routing_id)ごとの書き込みレート制限。flood で正規メッセージを押し出す(eviction)のを防ぐ。
// device_idを知る相手＝engage済みしか投げられない前提の上の、二重目の壁。目隠しは保つ（身元は見ない）。
const RID_RATE_MAX = 120, RID_RATE_WINDOW_MS = 60 * 1000;
const ridRate = new Map();
function ridRateOk(rid) { const t = nowMs(); let r = ridRate.get(rid); if (!r || r.resetAt < t) { r = { count: 0, resetAt: t + RID_RATE_WINDOW_MS }; ridRate.set(rid, r); } r.count++; return r.count <= RID_RATE_MAX; }

const validRid = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(s);
const safeId = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
const pad = (n) => String(n).padStart(12, '0');
const seqOf = (f) => parseInt(f.slice(0, 12), 10);
const idOf = (f) => { const i = f.indexOf('__'); return i >= 0 ? f.slice(i + 2, f.length - 5) : ''; };
const ridDir = (rid) => join(BOX, rid);

async function listFiles(rid) { try { return (await readdir(ridDir(rid))).filter((f) => f.endsWith('.json')); } catch { return []; } }

// TTL・件数超過の掃除（ディスク）。
async function sweep(rid) {
  const dir = ridDir(rid);
  let files = (await listFiles(rid)).sort((a, b) => seqOf(a) - seqOf(b));
  const t = nowMs();
  for (const f of [...files]) {
    try { const st = await stat(join(dir, f)); if (t - st.mtimeMs > TTL_MS) { await unlink(join(dir, f)).catch(() => {}); files = files.filter((x) => x !== f); } } catch {}
  }
  while (files.length > MAX_PER_ROUTING) { const f = files.shift(); await unlink(join(dir, f)).catch(() => {}); }
}

async function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = []; const to = setTimeout(() => reject(new Error('body timeout')), 15000);
    req.on('data', (c) => { n += c.length; if (n > cap) { clearTimeout(to); reject(new Error('too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { clearTimeout(to); resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', (e) => { clearTimeout(to); reject(e); });
  });
}
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = createServer(async (req, res) => {
  const ip = req.socket.remoteAddress || '?';
  const url = new URL(req.url, `http://x:${PORT}`);
  // ループバックはIPレート制限の対象外。Funnel経由の外部トラフィックも全て127.0.0.1で
  // 届くため、per-IP制限はここでは識別力がない（自分のポーリングを429で殺すだけだった）。
  // 書き込みfloodは宛先ごとの ridRate が引き続き守る。
  const loopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!loopback && !rateOk(ip)) return json(res, 429, { error: 'rate' });
  try {
    if (url.pathname === '/health' || url.pathname === '/') return json(res, 200, { ok: true, box: BOX });

    // 投函: {to_routing_id, envelope} を宛先メールボックスへ追記（seqはディスク連番＝再起動でも継続）。
    if (url.pathname === '/put' && req.method === 'POST') {
      const raw = await readBody(req, MAX_ENV_BYTES + 4096);
      let p; try { p = JSON.parse(raw); } catch { return json(res, 400, { error: 'bad json' }); }
      const rid = p.to_routing_id, env = p.envelope;
      if (!validRid(rid)) return json(res, 400, { error: 'bad routing_id' });
      if (!ridRateOk(rid)) return json(res, 429, { error: 'routing rate' }); // 宛先flood対策

      if (!env || typeof env !== 'object' || typeof env.envelope_id !== 'string' || typeof env.ciphertext !== 'string')
        return json(res, 400, { error: 'bad envelope' });
      if (Buffer.byteLength(JSON.stringify(env), 'utf8') > MAX_ENV_BYTES) return json(res, 413, { error: 'envelope too large' });
      if (!(await hasRoom(BOX))) return json(res, 507, { error: 'insufficient storage' }); // 預かれないなら断る
      const dir = ridDir(rid); await mkdir(dir, { recursive: true });
      const files = await listFiles(rid);
      const eid = safeId(env.envelope_id);
      const dup = files.find((f) => idOf(f) === eid);
      if (dup) return json(res, 200, { ok: true, seq: seqOf(dup), dup: true }); // 冪等
      const seq = files.reduce((m, f) => Math.max(m, seqOf(f)), 0) + 1;         // ディスク連番
      await writeFile(join(dir, `${pad(seq)}__${eid}.json`), JSON.stringify(env), 'utf8');
      await sweep(rid);
      return json(res, 200, { ok: true, seq });
    }

    // 取り出し: routing_id 宛の after より新しい封筒を返す（消さない＝カーソル方式）。
    if (url.pathname === '/get' && req.method === 'GET') {
      const rid = url.searchParams.get('routing_id');
      const after = Number(url.searchParams.get('after') || 0);
      if (!validRid(rid)) return json(res, 400, { error: 'bad routing_id' });
      await sweep(rid);
      const picked = (await listFiles(rid)).map((f) => ({ seq: seqOf(f), f })).filter((x) => x.seq > after).sort((a, b) => a.seq - b.seq);
      const items = [];
      for (const x of picked) { try { items.push({ seq: x.seq, envelope: JSON.parse(await readFile(join(ridDir(rid), x.f), 'utf8')) }); } catch {} }
      const cursor = picked.length ? picked[picked.length - 1].seq : after;
      return json(res, 200, { items, cursor });
    }
    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, e.message === 'too large' ? 413 : 400, { error: e.message });
  }
});

server.requestTimeout = 20000;
server.maxConnections = 200;
await mkdir(BOX, { recursive: true });
if (!(await hasRoom(BOX))) {
  console.error(`middleman relay: ディスクの空きが少なすぎます（${humanBytes(await freeBytes(BOX))}）。空きを作ってから起動してください。`);
  process.exit(1);
}
// localhostのみにbind。外への公開は Tailscale Funnel が 127.0.0.1 へプロキシする形で行う
// （＝node自身は外向きポートを開かない。firewallダイアログ回避＋攻撃面の縮小。MM_BINDで上書き可）。
server.listen(PORT, process.env.MM_BIND || '127.0.0.1', () => console.log(`middleman relay:  http://localhost:${PORT}  (disk永続 box=${BOX})`));

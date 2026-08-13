// 配線盤のデータ層＝ペアごとのサイドカー保存（seen/screen/triage/opened/inquiry）と
// 画面用JSONビュー（state/pair/inbox/letter/sent）。web.js から分離（2026-07-20 リファクタ③）。
// HTTPやプロセスのことは知らない。web.js（ルータ）が呼ぶだけの純データモジュール。

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { identityPath, pairPaths } from '../lib/paths.js';
import { listPairs, readPeer, readJson, writeJson } from '../lib/store.js';
import { pairSafetyNumber } from '../lib/pairing.js';
import { receiveInbox, sendReceipt, receiptsEnabled, readSentStatus, CONTROL_TYPES } from '../lib/exchange.js';
const isControl = (m) => CONTROL_TYPES.includes(m.type); // 受領・プロフィール等＝人間の一覧に出さない
import { pushToRelay, pullAllFromRelay } from '../lib/relay.js';
import { beat, reachOf } from '../lib/presence.js';
import { screen } from '../lib/guard.js';
import { warn } from '../lib/log.js';
import { hasRoom, humanBytes, freeBytes } from '../lib/disk.js';
import { t, tf } from '../lib/i18n.js';

const RELAY = process.env.MM_RELAY || '/tmp/mm-demo/relay';
const now = () => new Date().toISOString();

export async function identity() { return readJson(identityPath()); }

// --- 手元だけの小さな真実たち（サイドカー） --------------------------------
// 既読の定義は opened.json に一本化（2026-07-20・voicecode指摘）。「本文を開いた」が唯一の既読。
// 旧 seen.json は廃止（ディスクに残っていても読まない）。

// suspicious判定はサイドカー screen.json に置く（署名済みmessageは汚さない）。
function screenPath(pairId) { return join(pairPaths(pairId).base, 'screen.json'); }
async function readScreen(pairId) { try { return await readJson(screenPath(pairId)); } catch { return {}; } }
const screenInFlight = new Set();
// 未点検の相手メッセージを手元AIでメタ点検（fire-and-forget、応答はブロックしない）。
async function screenPair(pairId, peerDeviceId) {
  const sc = await readScreen(pairId);
  const msgs = await messagesOf(pairId);
  for (const m of msgs) {
    if (m.from !== peerDeviceId || sc[m.id]) continue;
    const key = pairId + ':' + m.id;
    if (screenInFlight.has(key)) continue;
    screenInFlight.add(key);
    screen({ body: m.body }).then(async (v) => {
      if (v.checked) { const cur = await readScreen(pairId); cur[m.id] = { flag: v.flag, reason: v.reason }; await writeJson(screenPath(pairId), cur); }
    }).catch((e) => {
      // 縁が消えた後の書き込み失敗(ENOENT)は正常なので警告に出さない
      // （正常なノイズで本当の異常が埋もれるのを防ぐ）。それ以外は記録する。
      if (e && e.code !== 'ENOENT') warn(tf('screening ({pair})', { pair: pairId }), e);
    }).finally(() => screenInFlight.delete(key)); // 失敗してもサーバは落とさない
  }
}

// triage: どの着信を Apply/Decline したか。裁定の結果は着信一覧に「状態」として残る。
function triagePath(pairId) { return join(pairPaths(pairId).base, 'triage.json'); }
async function readTriage(pairId) { try { return await readJson(triagePath(pairId)); } catch { return {}; } }
export async function markTriage(pairId, id, verdict) { const t = await readTriage(pairId); t[id] = verdict; await writeJson(triagePath(pairId), t); }
// 既読（本文を開いた）マーカー＝バッジ用。裁定(triage)とは別で、目視で減る。
function openedPath(pairId) { return join(pairPaths(pairId).base, 'opened.json'); }
async function readOpened(pairId) { try { return new Set(await readJson(openedPath(pairId))); } catch { return new Set(); } }
async function markOpened(pairId, id) { const s = await readOpened(pairId); if (s.has(id)) return false; s.add(id); await writeJson(openedPath(pairId), [...s]); return true; }
// 照会ログ＝別経路で本人に連絡しに行った「行為の記録」。{ [msgId]: [{ch,at,note}] }。
// 「確認済み」という状態は持たない（本人性は保証しない）。過去の行為だけを残す。
function inquiryPath(pairId) { return join(pairPaths(pairId).base, 'inquiry.json'); }
async function readInquiry(pairId) { try { return await readJson(inquiryPath(pairId)); } catch { return {}; } }
export async function addInquiry(pairId, msgId, entry) {
  const all = await readInquiry(pairId); (all[msgId] = all[msgId] || []).push(entry);
  await writeJson(inquiryPath(pairId), all); return all[msgId];
}

// --- 共有の小道具 -----------------------------------------------------------
// 連絡経路（本人確認で開くツール）＝ [{key,label,value}]。相手が自分の設定で宣言し、署名つきで届く。
// 開くURLの妥当性のみ検証（本人性は保証しない）。壊れた値は落とす。
export function sanitizeChannels(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 12).map((c) => ({
    key: String(c.key || 'other').slice(0, 20).replace(/[^a-z0-9_-]/gi, ''),
    label: String(c.label || '').slice(0, 30),
    value: String(c.value || '').slice(0, 300),
  })).filter((c) => c.value);
}
// 開いてよいURLスキーム（アプリ前面化用）。file:等は拒否。
export const OPEN_SCHEMES = ['http', 'https', 'mailto', 'tel', 'sms', 'line', 'tg', 'slack', 'msteams', 'zoommtg', 'fb-messenger'];

// ユーザーが手元で付けた設定＝相手のバンドルには無い、自分だけの値。
// 再接続(re-engage)やソフト更新でpeerを再構築しても、これらは決して上書きしない（＝ユーザーデータの保全）。
const LOCAL_PEER_FIELDS = ['alias', 'show_presence', 'receiptsEnabled', 'ai'];
export function carryLocalPeer(peer, existing) {
  if (existing) for (const k of LOCAL_PEER_FIELDS) if (k in existing) peer[k] = existing[k];
  return peer;
}
// 表示名。alias(手元の呼び名)があれば最優先でそのまま。無ければ 名前/縁名 に、
// 人間なら「さん」を付ける。AI/タブ(peer.ai=true 例:codex)には付けない。
export function contactLabel(pairId, name, alias, ai) { if (alias) return alias; const base = name || pairId; return ai ? base : tf('{name}', { name: base }); }

// --- メッセージの読み出し ---------------------------------------------------
// 自分のエンドが持つ履歴（自分発＋受信済）。分散＝各エンドが自分の分だけ持つ。
async function messagesOf(pairId) {
  const dir = pairPaths(pairId).messages;
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.msg.json')); } catch {}
  const out = [];
  for (const f of files) { try { out.push(await readJson(join(dir, f))); } catch {} }
  return out.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

// relayから取り込む（新着反映）。取り込みは全体で1回、差出人ごとに振り分ける。
// 短時間に何度も呼ばれる（画面のポーリング）ので、少しの間は結果を使い回す。
let pullPromise = null, pulledAt = 0;
const PULL_INTERVAL_MS = 1500;
async function pullAll() {
  if (pullPromise) return pullPromise;                       // 同時呼び出しは1回にまとめる
  if (Date.now() - pulledAt < PULL_INTERVAL_MS) return null;  // 直後の連打は素通り
  pullPromise = (async () => {
    // 空きが無いときは取り込まない。relayに残るので手紙は失われず、空けてから受け取れる。
    if (!(await hasRoom())) { warn(t('disk'), new Error(tf('receiving paused: low disk space ({free} left)', { free: humanBytes(await freeBytes()) }))); return; }
    const me = await identity();
    const peersOf = {}, peers = {};
    for (const id of await listPairs()) {
      try { const p = await readPeer(id); peersOf[p.device_id] = id; peers[id] = p; } catch {}
    }
    try {
      const placed = await pullAllFromRelay({ relayDir: RELAY, myDeviceId: me.device_id, peersOf });
      // 封筒が置かれた縁だけ復号・検証する（届かないのに画面が正常に見える、を防ぐ）
      for (const id of Object.keys(placed || {})) {
        try { await receiveInbox({ identity: me, peer: peers[id], pairId: id, now }); }
        catch (e) { warn(tf('receive ({pair})', { pair: id }), e); }
      }
    } catch (e) { warn(t('receive'), e); }
    pulledAt = Date.now();
  })().finally(() => { pullPromise = null; });
  return pullPromise;
}

// --- 画面用JSONビュー -------------------------------------------------------
export async function stateJson() {
  await pullAll();
  const me = await identity();
  const pairs = [];
  for (const id of await listPairs()) {
    let peer; try { peer = await readPeer(id); } catch { continue; }
    const visible = !!peer.show_presence; // デフォルトは隠す（ステルス）
    if (visible) await beat({ relayDir: RELAY, pairId: id, myDeviceId: me.device_id, nowIso: now() });
    const reach = await reachOf({ relayDir: RELAY, pairId: id, peerDeviceId: peer.device_id, nowIso: now() });
    const opened = await readOpened(id);
    const msgs = await messagesOf(id);
    screenPair(id, peer.device_id); // fire-and-forget メタ点検
    const sc = await readScreen(id);
    const unread = msgs.filter((m) => m.from === peer.device_id && !isControl(m) && !opened.has(m.id)).length;
    const last = msgs.length ? msgs[msgs.length - 1].created_at : null;
    const flagged = msgs.some((m) => m.from === peer.device_id && sc[m.id] && sc[m.id].flag);
    pairs.push({ id, name: peer.name || '', alias: peer.alias || '', icon: peer.icon || '', avatar: peer.avatar || '', banner: peer.banner || '', label: contactLabel(id, peer.name, peer.alias, peer.ai),
      device: peer.device_id.slice(0, 8), verified: !!peer.verified,
      unread, online: reach.online, lastActivity: last, visible, flagged });
  }
  return { me: { device_id: me.device_id }, pairs };
}

// opt.limit / opt.before でサーバ側ページング（before=そのidより古い側を返す・最新から遡る用）。
export async function pairJson(id, opt = {}) {
  await pullAll();
  const me = await identity();
  const peer = await readPeer(id);
  const sn = pairSafetyNumber({ pairId: id, identity: me, peer });
  const all = (await messagesOf(id)).filter((m) => !isControl(m)); // 履歴＝人間の手紙だけ
  const reach = await reachOf({ relayDir: RELAY, pairId: id, peerDeviceId: peer.device_id, nowIso: now() });
  screenPair(id, peer.device_id);
  const sc = await readScreen(id);
  let list = all;
  if (opt.before) { const i = all.findIndex((m) => m.id === opt.before); if (i >= 0) list = all.slice(0, i); }
  const limit = Math.min(Number(opt.limit) || 0, 200);
  const first = limit && list.length > limit ? list.length - limit : 0;
  if (limit) list = list.slice(first);
  const hasMore = list.length > 0 ? all.findIndex((m) => m.id === list[0].id) > 0 : false;
  return {
    id, verified: !!peer.verified, device: peer.device_id.slice(0, 12),
    name: peer.name || '', alias: peer.alias || '', label: contactLabel(id, peer.name, peer.alias, peer.ai),
    avatar: peer.avatar || '', banner: peer.banner || '', links: peer.links || '', channels: sanitizeChannels(peer.channels),
    safety: sn.display, visible: !!peer.show_presence, online: reach.online, lastSeen: reach.lastSeen,
    total: all.length, hasMore,
    messages: list.map((m) => ({ id: m.id, mine: m.from === me.device_id, body: m.body,
      at: m.created_at, suspicious: sc[m.id] || null })),
  };
}

// 着信＝人間の裁定待ち＋裁定済み（相手発・受領でない）。本文は含めない（クリックで別途）。
export async function inboxJson() {
  await pullAll();
  const me = await identity();
  const items = [];
  for (const id of await listPairs()) {
    let peer; try { peer = await readPeer(id); } catch { continue; }
    screenPair(id, peer.device_id);
    const sc = await readScreen(id);
    const tri = await readTriage(id);
    const op = await readOpened(id);
    for (const m of await messagesOf(id)) {
      if (m.from !== peer.device_id || isControl(m)) continue; // 手当て済み(applied/declined)も一覧に残す
      items.push({ pair: id, id: m.id, at: m.created_at, label: contactLabel(id, peer.name, peer.alias, peer.ai), icon: peer.icon || '', avatar: peer.avatar || '',
        unread: !op.has(m.id), // 開いていない＝未読（バッジに数える）
        triage: tri[m.id] || '', // ''｜'applied'｜'declined'（手当ての結果）
        suspicious: sc[m.id] && sc[m.id].flag ? { reason: sc[m.id].reason } : false });
    }
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : -1));
}

// 1通の本文（点検つき）。本文ウィンドウ用。
export async function letterJson(pairId, id) {
  const sc = await readScreen(pairId);
  let label = pairId, channels = [], peer = null; try { peer = await readPeer(pairId); label = contactLabel(pairId, peer.name, peer.alias, peer.ai); channels = sanitizeChannels(peer.channels); } catch {}
  const inq = await readInquiry(pairId);
  for (const m of await messagesOf(pairId)) {
    if (m.id === id) {
      const fresh = await markOpened(pairId, id); // 開いた＝既読（初回だけ true）
      // 相手の手紙を初めて開いたら、その場で送信者へ「既読」を返す（Applyを待たない＝クリック即時）。
      if (fresh && peer && m.from === peer.device_id && receiptsEnabled(peer)) {
        try { const me = await identity(); await sendReceipt({ identity: me, peer, pairId, re: id, status: 'read', now });
          await pushToRelay({ pairId, relayDir: RELAY, peerDeviceId: peer.device_id }); }
        catch (e) { warn(tf('read receipt ({pair})', { pair: pairId }), e); }
      }
      return { pair: pairId, id, at: m.created_at, body: m.body, label, suspicious: sc[id] || null,
        channels, inquiries: inq[id] || [] }; }
  }
  return { error: 'not found' };
}

// 送信済み＋状態（sent|read|declined）。送信側の視界。
export async function sentJson() {
  const me = await identity();
  const rows = [];
  for (const id of await listPairs()) {
    const st = await readSentStatus(id);
    let label = id, avatar = '', icon = ''; try { const peer = await readPeer(id); label = contactLabel(id, peer.name, peer.alias, peer.ai); avatar = peer.avatar || ''; icon = peer.icon || ''; } catch {}
    for (const m of await messagesOf(id)) {
      if (m.from !== me.device_id || isControl(m)) continue;
      const s = st[m.id]; const status = (s && typeof s === 'object') ? s.status : (s || 'sent'); const reason = (s && typeof s === 'object') ? (s.reason || '') : '';
      rows.push({ pair: id, id: m.id, at: m.created_at, body: m.body, label, avatar, icon, status, reason });
    }
  }
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1));
}

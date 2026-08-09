// 送受信コア。CLIの send/receive とラリーループが共有する。
// 受信は復号・署名・整合を全て通ったものだけ messages/ に落とす。
// 失敗はログに残すが本文化しない（invariant 1）。

import { join } from 'node:path';
import { rename } from 'node:fs/promises';
import { pairPaths } from './paths.js';
import { seal, open, signMessage, verifyMessage } from './crypto.js';
import { buildMessage, messageIsSane } from './message.js';
import { logEvent, writeJson, readJson, listBox, messageExists, readPeer, writePeer } from './store.js';

export async function sendMessage({ identity, peer, pairId, body, type, now }) {
  const p = pairPaths(pairId);
  const msg = signMessage(identity, buildMessage({ identity, peer, pairId, body, createdAtIso: now(), type: type || 'text/plain' }));
  const envelope = seal({ identity, peer, pairId, message: msg });
  await writeJson(join(p.messages, `${msg.id}.msg.json`), msg);
  await writeJson(join(p.outbox, `${envelope.envelope_id}.env.json`), envelope);
  await logEvent(pairId, { type: 'created', message_id: msg.id }, now());
  await logEvent(pairId, { type: 'sent', message_id: msg.id, envelope_id: envelope.envelope_id }, now());
  return { msg, envelope };
}

// --- 受領（既読／断り）＝送信者へ返す control letter -------------------------
// 人間の本文ではない制御メッセージ。type で分ける。プロトコルは同じ配管に載る。
export const RECEIPT_TYPE = 'application/mm-receipt';
export function receiptsEnabled(peer) { return peer.receipts !== false; } // 縁ごとトグル・既定on
function statusPath(pairId) { return join(pairPaths(pairId).base, 'sent-status.json'); }
export async function readSentStatus(pairId) { try { return await readJson(statusPath(pairId)); } catch { return {}; } }

// 相手の手紙 re に対して status(read|declined) を返す。
export async function sendReceipt({ identity, peer, pairId, re, status, reason, now }) {
  return sendMessage({ identity, peer, pairId, type: RECEIPT_TYPE, body: JSON.stringify({ re, status, reason: reason || '' }), now });
}

// --- プロフィール伝播 -------------------------------------------------------
// 自分のプロフィール（名前・アイコン・バナー・リンク・連絡経路）を、engaged済みの相手へ
// 制御レターで届ける。手紙自体がE2E署名済み＝差出人は暗号的に確定しているので、
// 受信側は安心して peer.json のプロフィール欄だけを更新できる（手元設定 alias 等は触らない）。
export const PROFILE_TYPE = 'application/mm-profile';
// seed（ソフト配布）。中身は巨大なので通常の手紙一覧には出さず、専用の「届いた荷物」で扱う。
export { PACKAGE_TYPE } from './package.js';
import { PACKAGE_TYPE as PKG_TYPE, savePackage } from './package.js';
export const CONTROL_TYPES = [RECEIPT_TYPE, PROFILE_TYPE, PKG_TYPE]; // 人間の着信一覧に出さない型

// ソフトを送る（相手の画面には「アップデートが届きました」として出る。展開はされない）。
export async function sendPackage({ identity, peer, pairId, pkg, now }) {
  return sendMessage({ identity, peer, pairId, type: PKG_TYPE, body: JSON.stringify(pkg), now });
}
export async function sendProfile({ identity, peer, pairId, profile, now }) {
  // 画像は「切り詰め」禁止（data URIを途中で切ると壊れた画像になる）。上限超えは丸ごと落とす。
  const img = (v, cap) => { const s = String(v || ''); return s.length <= cap ? s : ''; };
  const p = {
    name: String(profile.name || '').slice(0, 40), icon: String(profile.icon || '').slice(0, 8),
    avatar: img(profile.avatar, 120000), banner: img(profile.banner, 200000),
    links: String(profile.links || '').slice(0, 2000), channels: Array.isArray(profile.channels) ? profile.channels.slice(0, 12) : [],
  };
  // relayの封筒上限(256KB)に収める。溢れたら大きい順に諦める（バナー→アバター）。
  if (JSON.stringify(p).length > 230000) p.banner = '';
  if (JSON.stringify(p).length > 230000) p.avatar = '';
  return sendMessage({ identity, peer, pairId, type: PROFILE_TYPE, body: JSON.stringify({ profile: p }), now });
}
// 受信側：peer.json のプロフィール欄を更新（署名検証済みの手紙からのみ呼ばれる）。
async function applyProfile(pairId, msg) {
  let prof = null; try { prof = JSON.parse(msg.body).profile; } catch {}
  if (!prof || typeof prof !== 'object') return;
  const peer = await readPeer(pairId);
  const img = (v, cap) => { const s = String(v || ''); return s.length <= cap ? s : ''; }; // 切り詰め禁止＝超過は落とす
  peer.name = String(prof.name || '').slice(0, 40); peer.icon = String(prof.icon || '').slice(0, 8);
  peer.avatar = img(prof.avatar, 120000); peer.banner = img(prof.banner, 200000);
  peer.links = String(prof.links || '').slice(0, 2000);
  peer.channels = Array.isArray(prof.channels) ? prof.channels.slice(0, 12) : [];
  await writePeer(pairId, peer); // alias/show_presence等の手元設定はキーごと触らない＝保全
}

export async function receiveInbox({ identity, peer, pairId, now }) {
  const p = pairPaths(pairId);
  const files = await listBox(p.inbox, '.env.json');
  const received = [];
  let skipped = 0, rejected = 0;
  for (const f of files) {
    const envPath = join(p.inbox, f);
    let envelope;
    try { envelope = await readJson(envPath); } catch { rejected++; continue; }
    let msg;
    try {
      msg = open({ identity, peer, envelope });
      if (!verifyMessage(peer, msg)) throw new Error('signature invalid');
      const bad = messageIsSane(msg, peer, pairId, identity.device_id);
      if (bad) throw new Error(bad);
    } catch (e) {
      await logEvent(pairId, { type: 'rejected', envelope_id: envelope?.envelope_id, reason: e.message }, now());
      await rename(envPath, envPath + '.rejected').catch(() => {});
      rejected++;
      continue;
    }
    if (await messageExists(pairId, msg.id)) {
      await rename(envPath, join(p.inbox, f + '.dup')).catch(() => {});
      skipped++;
      continue;
    }
    // seed（ソフト配布）＝保存してハッシュ照合するだけ。展開も実行も絶対にしない。
    // 巨大なので messages には残さず、packages/ にファイルとメタだけ置く。
    if (msg.type === PKG_TYPE) {
      try {
        const pkg = JSON.parse(msg.body);
        await savePackage({ pkg, fromLabel: pairId, fromDevice: msg.from, msgId: msg.id, at: msg.created_at });
        await logEvent(pairId, { type: 'package-received', message_id: msg.id, name: pkg.name, version: pkg.version }, now());
      } catch (e) {
        await logEvent(pairId, { type: 'package-rejected', message_id: msg.id, reason: e.message }, now());
      }
      await rename(envPath, join(p.inbox, f + '.done')).catch(() => {});
      continue;
    }
    // プロフィール伝播＝制御メッセージ。相手のプロフィール欄を更新して終わり（着信には出さない）。
    if (msg.type === PROFILE_TYPE) {
      try { await applyProfile(pairId, msg); } catch {}
      await writeJson(join(p.messages, `${msg.id}.msg.json`), msg); // 冪等用
      await logEvent(pairId, { type: 'profile-updated', message_id: msg.id }, now());
      await rename(envPath, join(p.inbox, f + '.done')).catch(() => {});
      continue;
    }
    // 受領(既読/断り)は制御メッセージ＝人間の受信リストには出さず、送信控えのステータスを更新。
    if (msg.type === RECEIPT_TYPE) {
      let r = null; try { r = JSON.parse(msg.body); } catch {}
      if (r && r.re) {
        const st = await readSentStatus(pairId); st[r.re] = r.reason ? { status: r.status, reason: r.reason } : r.status; await writeJson(statusPath(pairId), st);
      }
      await writeJson(join(p.messages, `${msg.id}.msg.json`), msg); // 冪等用
      await logEvent(pairId, { type: 'receipt', re: r?.re, status: r?.status, message_id: msg.id }, now());
      await rename(envPath, join(p.inbox, f + '.done')).catch(() => {});
      continue;
    }
    await writeJson(join(p.messages, `${msg.id}.msg.json`), msg);
    await logEvent(pairId, { type: 'received', message_id: msg.id, envelope_id: envelope.envelope_id }, now());
    await rename(envPath, join(p.inbox, f + '.done')).catch(() => {});
    received.push(msg);
  }
  return { received, skipped, rejected };
}

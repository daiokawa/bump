// 接続リクエスト＝「承認する着信」。新規参加者のAIが自分の署名付きバンドルを相手へ送り、
// 受けた人が画面で承認したら engage 完了（Chatworkでの接続情報の貼り戻しが消える）。
//
// 縁がまだ無い相手なので共有鍵が無く、E2E暗号は使えない。中身は招待QRと同じ「署名付き平文
// バンドル」で、公開鍵しか含まない（秘密は載らない）。だから漏れても害はなく、
// 署名で「その鍵の持ち主が確かに送った」ことだけが証明される。
// なりすまし防止は暗号でなく人間の承認＋招待の出所（誰の紹介か）で担保する＝bumpの型。

import { join } from 'node:path';
import { readdir, unlink, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { root } from './paths.js';
import { readJson, writeJson, ensurePair, readPeer, writePeer, listPairs, logEvent } from './store.js';
import { signedBundle, verifyBundle } from './crypto.js';
import { postConnectRequest, pullConnectRequests, pushToRelay, replayStrays } from './relay.js';
import { inviteProof, matchInvite, claimInvite, inviteConflict, claimLinkInvite } from './invite.js';
import { engagePeer, markConfirmed } from './pairing.js';
import { sendProfile } from './exchange.js';

const pendingDir = () => join(root(), 'pending');
const pendingPath = (deviceId) => join(pendingDir(), `${String(deviceId).replace(/[^a-zA-Z0-9_-]/g, '')}.json`);

// ブロック＝鍵(device_id)の拒否リスト。連絡先にする前に効く（申請に鍵が入っているから）。
// 名前は変えられても鍵は変えられないので、同じ相手なら確実に弾ける。新しい鍵を作れば
// 申請自体は再びできるが、それは「別人として一からノックする」のと同じ＝承認しなければ何も起きない。
const blockedPath = () => join(root(), 'blocked.json');
export async function readBlocked() { try { const j = await readJson(blockedPath()); return Array.isArray(j) ? j : []; } catch { return []; } }
export async function isBlocked(deviceId) { return (await readBlocked()).some((b) => b.device_id === deviceId); }
export async function blockDevice(deviceId, name) {
  const list = await readBlocked();
  if (list.some((b) => b.device_id === deviceId)) return list;
  list.push({ device_id: String(deviceId), name: String(name || '').slice(0, 40), at: new Date().toISOString() });
  await writeJson(blockedPath(), list.slice(0, 500));
  return list;
}
export async function unblockDevice(deviceId) {
  const list = (await readBlocked()).filter((b) => b.device_id !== deviceId);
  await writeJson(blockedPath(), list);
  return list;
}

// 送る側：自分の公開バンドル＋名乗り＋一言を、相手のdevice_id宛に投函する。
// 専用パッケージで受け取った合言葉があれば、その証明値も載せる（相手側が機械で突き合わせる）。
export async function sendConnectRequest({ identity, toDeviceId, name, note, token, relayDir, now, ttlSec = 86400 }) {
  const bundle = signedBundle(identity, now(), ttlSec, {
    name: String(name || '').slice(0, 40),
    note: String(note || '').slice(0, 200),
    kind: 'connect-request',
    ...(token ? { invite_proof: inviteProof(token, identity.device_id) } : {}),
  });
  const id = randomUUID();
  await postConnectRequest({ relayDir, toDeviceId, envelopeId: id, payload: bundle });
  return { id, device_id: identity.device_id };
}

// 受ける側：申請を取り込み、署名を検証して pending/ に保存（承認待ちの列）。
// 検証に落ちたものは捨てる（ログにも本文化しない＝invariant 1）。
export async function receiveConnectRequests({ myDeviceId, relayDir, now }) {
  const items = await pullConnectRequests({ relayDir, myDeviceId }).catch(() => []);
  return handleConnectRequests(items, { myDeviceId, relayDir, now });
}

// 届いた申請（署名付きバンドル）を確かめて pending/ に置く。自分が出した招待リンク・QRの合言葉で来たものは
// 承認を待たずに縁を結ぶ（招待した本人がリンクを出している＝その時点で承諾済み）。
// 受信箱の取り込み（pullAllFromRelay の onConnect）からも呼ばれる＝画面を開いていなくても届く。
export async function handleConnectRequests(items, { myDeviceId, relayDir, now }) {
  const saved = [];
  if (items.length) await mkdir(pendingDir(), { recursive: true }); // writeJsonは親を作らない
  const blocked = await readBlocked();
  for (const b of items) {
    const chk = verifyBundle(b, now());
    if (!chk.ok) continue;                       // 署名切れ・改ざんは黙って捨てる
    if (b.device_id === myDeviceId) continue;    // 自分自身は無視
    if (blocked.some((x) => x.device_id === b.device_id)) continue; // ブロック済み＝届いた瞬間に捨てる
    // 合言葉の突き合わせ（自分が配ったパッケージのどれから来たか）。人の手間はここでゼロになる。
    // 名乗った鍵を控えて、同じ合言葉が別の鍵からも来ていないかを見る（＝転送・漏れの検知）。
    let iv = await matchInvite(b.invite_proof, b.device_id);
    if (iv) iv = await claimInvite(iv.token, b.device_id);
    const rec = {
      device_id: b.device_id, name: b.name || '', note: b.note || '',
      suite: b.suite, ed25519_pub: b.ed25519_pub, x25519_pub: b.x25519_pub,
      at: now(),
      // 合言葉そのものは pending に写さない（画面まで持ち回る必要がない）。証明値だけ残し、
      // 承認時にもう一度突き合わせて「使用済み」の印をつける。
      invite_proof: b.invite_proof || null,
      invite: iv ? { label: iv.label, sent_at: iv.created_at } : null,
    };
    await writeJson(pendingPath(b.device_id), rec);
    const link = await claimLinkInvite(b.invite_proof, b.device_id);
    if (link && !link.conflict) {
      const id = await engageFromLink(rec, { relayDir, now }).catch(() => null);
      if (id) { rec.engaged = id; await unlink(pendingPath(b.device_id)).catch(() => {}); }
    }
    saved.push(rec);
  }
  return saved;
}

// 招待リンクから来た申請で縁を結ぶ。既に同じ鍵と縁があれば何もしない。名前は相手の名乗り（ファイル名に
// 使える文字だけ）。同じ名前の縁が別の鍵で既にあれば pair-xxxxxx にして、鍵の置き換えは決してしない。
async function engageFromLink(rec, { relayDir, now }) {
  for (const id of await listPairs()) { try { if ((await readPeer(id)).device_id === rec.device_id) return id; } catch {} }
  const base = String(rec.name || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 40);
  let id = null;
  for (const cand of [base, `pair-${rec.device_id.slice(0, 6)}`]) {
    if (!cand) continue;
    try { await readPeer(cand); } catch { id = cand; break; }
  }
  if (!id) return null;                                      // 名前が埋まっている＝人の承認に回す
  await ensurePair(id);
  const peer = engagePeer({ pairId: id, bundle: rec });
  peer.engaged_at = now(); peer.name = rec.name || '';
  markConfirmed(peer, 'none', now());
  await writePeer(id, peer);
  await logEvent(id, { type: 'engaged', peer: peer.device_id, via: 'invite-link' }, now());
  await replayStrays(id, rec.device_id);                     // 縁ができる前に届いていた手紙
  try {                                                      // 自分のプロフィールを届ける（画面での承認と同じ）
    const me = await readJson(join(root(), 'identity.json'));
    const profile = await readJson(join(root(), 'profile.json')).catch(() => ({}));
    await sendProfile({ identity: me, peer, pairId: id, profile, now });
    await pushToRelay({ pairId: id, relayDir, peerDeviceId: peer.device_id });
  } catch {}
  return id;
}

// 承認待ちの一覧（新しい順）。
// 合言葉の衝突（同じ合言葉を別の鍵も名乗っている）は、保存時ではなく読む時に判定する。
// 後から2件目が来たら1件目も警告に変わる必要があるため（先に届いた方だけ素通しになるのを防ぐ）。
export async function listPending() {
  let files = [];
  try { files = (await readdir(pendingDir())).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    let rec; try { rec = await readJson(join(pendingDir(), f)); } catch { continue; }
    if (rec.invite && rec.invite_proof) {
      const iv = await matchInvite(rec.invite_proof, rec.device_id);
      rec.invite = iv ? { ...rec.invite, reused: !!iv.used_at, conflict: inviteConflict(iv, rec.device_id) } : null;
    }
    out.push(rec);
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export async function readPending(deviceId) { try { return await readJson(pendingPath(deviceId)); } catch { return null; } }
export async function dropPending(deviceId) { await unlink(pendingPath(deviceId)).catch(() => {}); }

// 承認/拒否のどちらでも、列から消す。承認時のengage自体はweb.js（既存のengage経路）が行う。

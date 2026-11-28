// 接続の申し込みの承認。画面（人が押す）と、合言葉が合った時の自動承認の両方がここを通る。
// 画面のサーバーと常駐のどちらが先に申し込みを取り込んでも同じ結果になるよう、処理は1か所に置く。
//
// 自動でつなぐのは、こちらが出した合言葉と合い、ほかの端末が同じ合言葉を使っていない時だけ
// （2026-11-28 大川さん決定）：
//  - 招待リンク：作ってから10分以内に中継が預かった申し込み（時刻は中継の時計）
//  - 名前を付けて渡したパッケージの合言葉：まだ使われていないもの
// 同じ名前の縁が別の鍵で既にある時は自動にしない（人が確かめる）。自動でつないだら記録を残し、
// 画面と通知で「つながりました。心当たりがなければ解けます」と知らせる（auto-connected.json）。

import { join } from 'node:path';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { root, pairPaths, safePairId } from './paths.js';
import { readPeer, writePeer, ensurePair, logEvent, readJson, writeJson } from './store.js';
import { engagePeer, markConfirmed, carryConfirmation, carryLocalPeer } from './pairing.js';
import { listPending, pendingPath } from './connect.js';
import { matchInvite, inviteConflict, markInviteUsed } from './invite.js';
import { replayStrays, pushToRelay } from './relay.js';
import { receiveInbox, sendProfile } from './exchange.js';

const autoPath = () => join(root(), 'auto-connected.json');
export async function readAuto() { try { const j = await readJson(autoPath()); return Array.isArray(j) ? j : []; } catch { return []; } }
export async function writeAuto(list) { await writeJson(autoPath(), list.slice(-50)); }

const clean = (s) => String(s || '').trim().slice(0, 40);
// 縁の名前：人が付けた名前 → 相手の名乗り → pair-xxxxxx。区切り文字などで使えない形は飛ばす。
function pairIdFor(rec, wanted) {
  for (const c of [clean(wanted), clean(rec.name)]) if (c && safePairId(c)) return c;
  return `pair-${rec.device_id.slice(0, 6)}`;
}

// 自分のプロフィールを1人に届ける（画面での保存と同じ中身）。プロフィールを保存していなければ送らない。
export async function sendMyProfile({ identity, pairId, relayDir, now }) {
  let prof; try { prof = await readJson(join(root(), 'profile.json')); } catch { return; }
  const peer = await readPeer(pairId);
  await sendProfile({ identity, peer, pairId, profile: prof, now });
  await pushToRelay({ pairId, relayDir, peerDeviceId: peer.device_id }).catch(() => {});
}

// 承認する。返り値: { engaged } ／ { error: 'not_found' } ／ { error: 'key_changed', existing }
export async function approveRequest({ deviceId, id: wanted, identity, relayDir, now, auto = null }) {
  // 画面と常駐が同時に同じ申し込みを承認しないよう、先に申し込みのファイルを手元へ移す（移せた側だけが進む）。
  const src = pendingPath(deviceId), taking = `${src}.taking-${process.pid}`;
  try { await rename(src, taking); } catch { return { error: 'not_found' }; }
  let rec; try { rec = await readJson(taking); } catch { await unlink(taking).catch(() => {}); return { error: 'not_found' }; }
  const id = pairIdFor(rec, wanted);
  let ex = null; try { ex = await readPeer(id); } catch {}
  const iv = rec.invite_proof ? await matchInvite(rec.invite_proof, rec.device_id) : null;
  const inviteOk = !!iv && !inviteConflict(iv, rec.device_id);
  let replaced = null;
  if (ex && ex.device_id !== rec.device_id) {
    // 同じ名前の縁に別の鍵。新しいパッケージの合言葉が通った人の承認の時だけ鍵を置き換える。
    // それ以外は断る（黙って繋ぎ直さない）。古い peer.json は消さずに横へ退避する。
    if (!inviteOk || auto) { await rename(taking, src).catch(() => {}); return { error: 'key_changed', existing: ex, id }; }
    replaced = ex.device_id;
    await writeFile(join(pairPaths(id).base, `peer.replaced-${now().replace(/[:.]/g, '')}.json`), JSON.stringify(ex, null, 2));
  }
  await ensurePair(id);
  const peer = engagePeer({ pairId: id, bundle: rec });
  peer.engaged_at = now(); peer.name = clean(rec.name);
  carryLocalPeer(peer, ex);
  markConfirmed(peer, inviteOk ? 'invite' : 'none', now());
  carryConfirmation(peer, ex);
  if (auto) peer.auto_connected = { via: auto.via, at: now(), ...(auto.link_at ? { link_at: auto.link_at } : {}) };
  await writePeer(id, peer);
  if (iv) await markInviteUsed(iv.token, rec.device_id, now());   // どのパッケージの合言葉で来たか（系統）
  await logEvent(id, { type: 'engaged', peer: peer.device_id, via: auto ? `auto-${auto.via}` : 'connect-request',
    invite: iv ? iv.label : null, confirmed_by: peer.confirmed_by, ...(replaced ? { replaced } : {}) }, now());
  await unlink(taking).catch(() => {});
  // 承認の前に届いていた手紙を受信箱に移し、その場で開いて確かめる（以前は移すだけで、
  // 次に常駐がこの縁を見るまで一覧に出なかった）。
  if (await replayStrays(id, rec.device_id)) await receiveInbox({ identity, peer, pairId: id, now }).catch(() => {});
  await sendMyProfile({ identity, pairId: id, relayDir, now }).catch(() => {});
  if (auto) {
    const list = await readAuto();
    list.push({ pair: id, device_id: rec.device_id, name: peer.name, at: now(), via: auto.via, link_at: auto.link_at || null, seen: false, notified: false });
    await writeAuto(list);
  }
  return { engaged: id };
}

// 合言葉が合った申し込みを自動でつなぐ。画面のサーバーと常駐の両方が、申し込みを取り込んだあとに呼ぶ。
export function autoKind(rec) {
  if (rec.via_link && rec.via_link.fresh && !rec.via_link.conflict) return { via: 'link', link_at: rec.via_link.link_at };
  if (rec.invite && !rec.invite.conflict && !rec.invite.reused) return { via: 'invite' };
  return null;
}
export async function autoApprovePending({ identity, relayDir, now }) {
  const done = [];
  for (const rec of await listPending()) {
    const kind = autoKind(rec);
    if (!kind) continue;
    const r = await approveRequest({ deviceId: rec.device_id, identity, relayDir, now, auto: kind }).catch(() => null);
    if (r && r.engaged) done.push({ pair: r.engaged, name: clean(rec.name), via: kind.via });
  }
  return done;
}

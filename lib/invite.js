// 専用パッケージの合言葉。誰に何を渡したかを配る側が覚えておき、届いた申請と機械が突き合わせる。
//
// なぜこれで本人と言えるのか：合言葉は「加賀爪さんに渡したパッケージ」の中にしか無い。
// それを載せた申請が届いたなら、その申請は渡した先から出ている。名乗りは真似できるが、
// 渡していない相手は合言葉を作れない。人が電話で番号を読み合わせる代わりを機械がやる。
//
// 流れる形は sha256(合言葉 + 申請者のdevice_id)。合言葉そのものは経路に出さず、
// 別の鍵に貼り替えても通らない（＝拾って使い回せない）。

import { join } from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { root } from './paths.js';
import { readJson, writeJson } from './store.js';

const invitesPath = () => join(root(), 'invites.json');

export async function listInvites() {
  try { const j = await readJson(invitesPath()); return Array.isArray(j) ? j : []; } catch { return []; }
}

// 合言葉の証明値。device_id に結びつけるので、別の鍵の申請に貼り替えても一致しない。
export function inviteProof(token, deviceId) {
  return createHash('sha256').update(String(token)).update('\n').update(String(deviceId)).digest('hex');
}

// 配る側：宛先ラベルつきの合言葉を1つ発行して覚える（パッケージ作成時に呼ぶ）。
export async function newInvite(label) {
  const token = randomBytes(16).toString('base64url');   // 22文字前後・URL安全
  const list = await listInvites();
  list.push({ token, label: String(label || '').slice(0, 40), created_at: new Date().toISOString(), used_at: null, used_by: null });
  await writeJson(invitesPath(), list.slice(-300));
  return token;
}

// 受ける側：申請の proof が、自分が配ったどれかの合言葉と一致するか。
// 一致すれば「どのパッケージから来たか」が分かる＝系統（誰から誰へ渡ったか）の記録にもなる。
export async function matchInvite(proof, deviceId) {
  if (!proof) return null;
  const want = Buffer.from(String(proof), 'utf8');
  for (const iv of await listInvites()) {
    const got = Buffer.from(inviteProof(iv.token, deviceId), 'utf8');
    if (got.length === want.length && timingSafeEqual(got, want)) return iv;
  }
  return null;
}

// 合言葉を名乗った鍵を控える（申請が届いた時点で。承認の前）。
// 合言葉はパッケージの中にある共有の秘密なので、パッケージが転送されれば別人も使える。
// そこで「同じ合言葉を、別の鍵が使った」ことを検知する ── 一方は本人ではない。
// 大川さんの言う「オンラインに同じ人が2名いたら、行動の前に気づける」の実装。
export async function claimInvite(token, deviceId) {
  const list = await listInvites();
  const iv = list.find((x) => x.token === token);
  if (!iv) return null;
  iv.claims = Array.isArray(iv.claims) ? iv.claims : [];
  if (!iv.claims.includes(deviceId)) { iv.claims.push(deviceId); await writeJson(invitesPath(), list); }
  return iv;
}

// 同じ合言葉を名乗った鍵が2つ以上あるか（＝どちらかは渡した相手ではない）。
export function inviteConflict(iv, deviceId) {
  const others = (iv.claims || []).filter((d) => d !== deviceId);
  if (iv.used_by && iv.used_by !== deviceId) others.push(iv.used_by);
  return others.length > 0;
}

// 使われた合言葉に印をつける（承認時）。消さずに残すのは、同じ人が入れ直す場合に
// 「一致した。ただし2回目」と正直に言えるようにするため。
export async function markInviteUsed(token, deviceId, at) {
  const list = await listInvites();
  const iv = list.find((x) => x.token === token);
  if (!iv) return null;
  if (!iv.used_at) { iv.used_at = at; iv.used_by = deviceId; }
  await writeJson(invitesPath(), list);
  return iv;
}

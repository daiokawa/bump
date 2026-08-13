// 暗号スイート mm1: x25519(ECDH) + HKDF-SHA256 + AES-256-GCM + Ed25519(署名)。
// Node標準 crypto のみ。将来差し替え可能なようスイート名を明示する。
//
// 設計上の要点（codexレビュー反映）:
//  - 署名は「暗号化前の平文メッセージ」に対して行い、署名ごと暗号化する。
//  - GCM nonce は毎回 randomBytes(12)。再利用は絶対禁止。
//  - AAD に suite/pair_id/envelope_id/from/to を入れて封筒メタを改竄検知。
//  - 合言葉からは鍵を作らない（PAKE不使用）。合言葉は safety number の人間確認のみ。

import {
  generateKeyPairSync,
  createPublicKey,
  createPrivateKey,
  diffieHellman,
  hkdfSync,
  randomBytes,
  randomUUID,
  createHash,
  sign as edSign,
  verify as edVerify,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';

export const SUITE = 'mm1-x25519-hkdf-sha256-aes256gcm-ed25519';

const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (str) => Buffer.from(str, 'base64');

// 決定的シリアライズ（キーを再帰ソート）。署名・ハッシュ・AAD はこれに載せる。
// JSON.stringify のキー順は実装依存で、クロス実装（Chrome拡張・別言語アダプタ）で
// 署名が割れる。bumpは「AI非依存の層」を狙うので、継ぎ目は canonical で固定する。
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
const canonicalBytes = (v) => Buffer.from(canonical(v), 'utf8');

// --- 鍵の生成・エクスポート -------------------------------------------------

// spki(公開)/pkcs8(秘密) DER を base64 で持つ（Nodeで再import可能・移植性あり）。
function exportPub(key) {
  return b64(key.export({ type: 'spki', format: 'der' }));
}
function exportPriv(key) {
  return b64(key.export({ type: 'pkcs8', format: 'der' }));
}
function importPub(b64der) {
  return createPublicKey({ key: unb64(b64der), format: 'der', type: 'spki' });
}
function importPriv(b64der) {
  return createPrivateKey({ key: unb64(b64der), format: 'der', type: 'pkcs8' });
}

// device_id = ed25519公開鍵のSHA-256先頭16バイトを16進（短く安定なID）。
function deviceIdFromEdPub(b64der) {
  return createHash('sha256').update(unb64(b64der)).digest('hex').slice(0, 32);
}

// 自分のアイデンティティ一式を生成。
export function generateIdentity(createdAtIso) {
  const ed = generateKeyPairSync('ed25519');
  const x = generateKeyPairSync('x25519');
  const edPub = exportPub(ed.publicKey);
  return {
    suite: SUITE,
    device_id: deviceIdFromEdPub(edPub),
    created_at: createdAtIso,
    ed25519: { pub: edPub, priv: exportPriv(ed.privateKey) },
    x25519: { pub: exportPub(x.publicKey), priv: exportPriv(x.privateKey) },
  };
}

// 相手に渡す公開bundle（秘密鍵は含めない）。
export function publicBundle(identity) {
  return {
    suite: identity.suite,
    device_id: identity.device_id,
    ed25519_pub: identity.ed25519.pub,
    x25519_pub: identity.x25519.pub,
  };
}

// --- QRペアリング用の署名付きbundle（短命・単回・自己署名） ----------------
// codexレビュー反映: expires_at(短命)・qr_nonce・Ed25519署名を入れる。
// 署名は「このbundleがそのidentity鍵の所有者のもの」を示す。中間者防止の本体は
// "カメラで直接スキャンした"事実（＝物理近接）で、それはUI側が via=camera で担う。

export function signedBundle(identity, nowIso, ttlSec = 300, extra = {}) {
  const body = {
    v: 1,
    suite: identity.suite,
    device_id: identity.device_id,
    ed25519_pub: identity.ed25519.pub,
    x25519_pub: identity.x25519.pub,
    created_at: nowIso,
    expires_at: new Date(Date.parse(nowIso) + ttlSec * 1000).toISOString(),
    qr_nonce: randomBytes(16).toString('hex'), // 128bit（codexレビュー）
    ...extra, // プロフィール（name, icon 等）も署名対象に含める＝認証されたプロフィール
  };
  const sig = edSign(null, canonicalBytes(body), importPriv(identity.ed25519.priv));
  return { ...body, sig: b64(sig) };
}

// 署名と有効期限を検証。OKでも verified にするかは呼び出し側（via=camera か）で決める。
export function verifyBundle(bundle, nowIso) {
  if (!bundle || bundle.v !== 1 || !bundle.sig) return { ok: false, reason: 'malformed' };
  const { sig, ...body } = bundle;
  const good = edVerify(null, canonicalBytes(body), importPub(bundle.ed25519_pub), unb64(sig));
  if (!good) return { ok: false, reason: 'bad signature' };
  if (Date.parse(bundle.expires_at) < Date.parse(nowIso)) return { ok: false, reason: 'expired' };
  return { ok: true };
}

// --- safety number（帯域外で人間が突き合わせる指紋） ------------------------

// 指紋対象: 両者のed25519公開鍵 / 両者のx25519公開鍵 / suite / pair_id。
// 両端で同値になるよう、各ペアの公開鍵はソートして順序非依存にする（対称）。
export function safetyNumber({ pairId, edPubA, edPubB, xPubA, xPubB, suite = SUITE }) {
  const [e1, e2] = [edPubA, edPubB].sort();
  const [x1, x2] = [xPubA, xPubB].sort();
  const h = createHash('sha256')
    .update(suite).update('\n')
    .update(pairId).update('\n')
    .update(e1).update('\n')
    .update(e2).update('\n')
    .update(x1).update('\n')
    .update(x2)
    .digest('hex');
  // 人間が読める短縮版: 60桁を5桁×12グループ。内部照合は完全ハッシュで行う。
  const digits = BigInt('0x' + h).toString().padStart(60, '0').slice(-60);
  const groups = digits.match(/.{1,5}/g).join(' ');
  return { full: h, display: groups };
}

// --- エンベロープ暗号化/復号 ------------------------------------------------

// 共有秘密: static-static ECDH（両端で同値）→ HKDFで per-message 鍵。
function sharedSecret(selfXPrivB64, peerXPubB64) {
  return diffieHellman({
    privateKey: importPriv(selfXPrivB64),
    publicKey: importPub(peerXPubB64),
  });
}

function aad({ suite, pair_id, envelope_id, from, to }) {
  return canonicalBytes({ suite, pair_id, envelope_id, from, to });
}

// 縁の名前を、中継に見せてよい形にする（人名を晒さない）。
// from/to があるので相関自体は元から可能＝ここで隠すのは「名前という中身」だけ。
export function pairTag(pairId) {
  return createHash('sha256').update(String(pairId || '')).digest('hex').slice(0, 16);
}

// 平文オブジェクト(署名済message) → 暗号化エンベロープ。
export function seal({ identity, peer, pairId, message }) {
  const envelope_id = randomUUID();
  const from = identity.device_id;
  const to = peer.device_id;
  const ss = sharedSecret(identity.x25519.priv, peer.x25519_pub);
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  // 縁の名前は封筒に平文で載せない（"Y.K." のような人名が中継に見えてしまう＝目隠しの穴。
  // 2026-07-27 AUDIT.md作成中に発見）。代わりに名前から作った短いハッシュを載せる。
  // 受信側は封筒に書かれた値をそのままAADに使うので、旧版との相互運用は保たれる。
  const meta = { suite: SUITE, pair_id: pairTag(pairId), envelope_id, from, to };
  const key = hkdfSync('sha256', ss, salt, Buffer.from('mm1-msg-key'), 32);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), nonce);
  cipher.setAAD(aad(meta));
  const pt = Buffer.from(JSON.stringify(message), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ...meta,
    salt: b64(salt),
    nonce: b64(nonce),
    tag: b64(tag),
    ciphertext: b64(ct),
  };
}

// エンベロープ → 平文message（復号）。失敗は例外。呼び出し側はログに残すが本文化しない。
export function open({ identity, peer, envelope }) {
  if (envelope.suite !== SUITE) throw new Error(`unknown suite: ${envelope.suite}`);
  if (envelope.to !== identity.device_id) throw new Error('envelope not addressed to this device');
  if (envelope.from !== peer.device_id) throw new Error('envelope from unknown peer');
  const ss = sharedSecret(identity.x25519.priv, peer.x25519_pub);
  const key = hkdfSync('sha256', ss, unb64(envelope.salt), Buffer.from('mm1-msg-key'), 32);
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), unb64(envelope.nonce));
  decipher.setAAD(aad({
    suite: envelope.suite, pair_id: envelope.pair_id,
    envelope_id: envelope.envelope_id, from: envelope.from, to: envelope.to,
  }));
  decipher.setAuthTag(unb64(envelope.tag));
  const pt = Buffer.concat([decipher.update(unb64(envelope.ciphertext)), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

// --- メッセージ署名/検証 ----------------------------------------------------

// 署名対象は sig 抜きの canonical バイト列（キー順に依存しない）。
function canonicalMessageBytes(message) {
  const { sig, ...rest } = message;
  return canonicalBytes(rest);
}

export function signMessage(identity, message) {
  const s = edSign(null, canonicalMessageBytes(message), importPriv(identity.ed25519.priv));
  return { ...message, sig: b64(s) };
}

export function verifyMessage(peer, message) {
  if (!message.sig) return false;
  return edVerify(null, canonicalMessageBytes(message), importPub(peer.ed25519_pub), unb64(message.sig));
}

// --- 汎用ハッシュ（ログ連鎖用） --------------------------------------------

export function sha256Hex(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

export { randomUUID };

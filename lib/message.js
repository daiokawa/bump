// 平文メッセージの組み立て。署名は crypto.signMessage が行う。
// message は「署名対象の平文メタ＋body」。envelope（暗号化）とは別層。

import { randomUUID, sha256Hex } from './crypto.js';

export function buildMessage({ identity, peer, pairId, body, createdAtIso, type = 'text/plain' }) {
  return {
    id: randomUUID(),
    pair_id: pairId,
    from: identity.device_id,
    to: peer.device_id,
    created_at: createdAtIso,
    type,
    body,
    body_hash: sha256Hex(body),
  };
}

// 受信メッセージの整合チェック（本文化する前に呼ぶ）。
export function messageIsSane(message, peer, pairId, selfDeviceId) {
  if (!message || typeof message !== 'object') return 'not an object';
  // pair_id は各自ローカルの呼び名＝両者で違って当たり前（分散設計）。身元は from/to/鍵/署名で
  // 完全に縛られており（別ペアの封筒は復号自体が失敗する）、呼び名の一致まで要求しない。
  if (message.from !== peer.device_id) return 'from mismatch';
  if (selfDeviceId && message.to !== selfDeviceId) return 'to mismatch';
  if (typeof message.body !== 'string') return 'body not string';
  if (message.body_hash !== sha256Hex(message.body)) return 'body_hash mismatch';
  return null; // ok
}

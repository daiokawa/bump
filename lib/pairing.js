// ペアリング＝関係性が認証（invariant 5）。
// 流れ: 各端末で鍵生成 → 公開bundle交換 → safety numberを帯域外で突合 → verified固定。
// 合言葉からは鍵を作らない。合言葉は safety number の人間確認に使うだけ（PAKE不使用）。

import { safetyNumber, SUITE } from './crypto.js';

// 相手のbundleを受け取り peer.json 用オブジェクトを組む（この時点では未検証）。
export function engagePeer({ pairId, bundle }) {
  if (bundle.suite && bundle.suite !== SUITE) {
    throw new Error(`unsupported suite: ${bundle.suite}（このエンドは ${SUITE}）`);
  }
  return {
    pair_id: pairId,
    device_id: bundle.device_id,
    ed25519_pub: bundle.ed25519_pub,
    x25519_pub: bundle.x25519_pub,
    verified: false,          // safety number 突合が済むまで trusted 扱いしない
    verified_at: null,
    engaged_at: null,         // CLIが時刻を注入
  };
}

// 自分と相手のsafety numberを算出（両端で同値になる）。
export function pairSafetyNumber({ pairId, identity, peer }) {
  return safetyNumber({
    pairId,
    edPubA: identity.ed25519.pub,
    edPubB: peer.ed25519_pub,
    xPubA: identity.x25519.pub,
    xPubB: peer.x25519_pub,
  });
}

// peer.jsonの公開鍵が変わっていたら原則エラー（再Engage扱い）。
export function pubkeysChanged(existingPeer, bundle) {
  return existingPeer.ed25519_pub !== bundle.ed25519_pub
      || existingPeer.x25519_pub !== bundle.x25519_pub;
}

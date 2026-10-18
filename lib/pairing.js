// ペアリング＝関係性が認証（invariant 5）。
// 流れ: 各端末で鍵生成 → 公開bundle交換 → 縁。確認の方法（合言葉／対面QR／確認なし）は記録として残す。
// 合言葉からは鍵を作らない（PAKE不使用）。

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
    confirmed_by: 'none',     // 確認の方法。経路ごとに markConfirmed で記録する
    verified: false,          // 互換用（古い版が読む）。confirmed_by から導く
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

// 確認の方法＝何をしたかの記録（「信頼できる」という状態ではない）。
// invite: 合言葉の照合が通った承認 / qr: 対面でカメラ読み取り / number: 番号の読み合わせ(bump verify) / none: 確認なし。
// 古い peer.json は confirmed_by を持たない。verified=true は対面QR扱い（当時の検証済みはQR直読みが主経路）。
const CONFIRM_METHODS = ['invite', 'qr', 'number', 'none'];
export function confirmedBy(peer) {
  if (peer && CONFIRM_METHODS.includes(peer.confirmed_by)) return peer.confirmed_by;
  return peer && peer.verified ? 'qr' : 'none';
}
// 記録する。verified も併記して、古い版が同じ peer.json を読んでも意味がずれないようにする（互換）。
export function markConfirmed(peer, method, at) {
  peer.confirmed_by = method;
  peer.verified = method !== 'none';
  peer.verified_at = peer.verified ? at : null;
  return peer;
}
// 同じ鍵で繋ぎ直した時は、前にした確認を引き継ぐ（今回の経路が確認なしでも、過去の確認は事実）。
// 鍵が変わっていたら引き継がない。
export function carryConfirmation(peer, existing) {
  if (!existing || pubkeysChanged(existing, peer)) return peer;
  if (confirmedBy(peer) === 'none' && confirmedBy(existing) !== 'none') {
    peer.confirmed_by = confirmedBy(existing); peer.verified = true; peer.verified_at = existing.verified_at || null;
  }
  return peer;
}

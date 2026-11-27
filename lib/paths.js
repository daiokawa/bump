// ~/.bump レイアウト。
// 専用領域に置く。repo配下・.claude/・task docs配下には絶対に置かない
// （受信文をClaudeが通常ソース文脈と誤認するのを防ぐ＝invariant 1の一部）。

import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

// MIDDLEMAN_HOME で差し替え可能（テスト・複数エンドを1マシンに立てる用）。
export function root() {
  // BUMP_HOME が正。旧名 MIDDLEMAN_HOME も読める（旧環境からの乗り換え互換）。
  return process.env.BUMP_HOME || process.env.MIDDLEMAN_HOME || join(homedir(), '.bump');
}

export function identityPath() {
  return join(root(), 'identity.json'); // 自分の鍵ペア（device_id・ed25519・x25519）
}

export function pairsDir() {
  return join(root(), 'pairs');
}

// 縁の名前は人や相手（申請の名乗り）が付ける＝外から来る値。区切り文字や .. で pairs/ の外を
// 指せないようにする。日本語などの名前はそのまま使える。
export function safePairId(pairId) {
  const s = String(pairId ?? '');
  if (!s || s === '.' || s === '..' || /[\\/\0]/.test(s)) return false;
  return resolve(pairsDir(), s).startsWith(resolve(pairsDir()) + sep);
}

export function pairDir(pairId) {
  if (!safePairId(pairId)) throw new Error(`invalid pair name: ${JSON.stringify(String(pairId ?? '')).slice(0, 60)}`);
  return join(pairsDir(), pairId);
}

// ペアごとのサブレイアウト。
export function pairPaths(pairId) {
  const base = pairDir(pairId);
  return {
    base,
    peer: join(base, 'peer.json'),      // 相手の公開鍵・safety number検証済フラグ
    outbox: join(base, 'outbox'),       // 送信待ち（暗号化済エンベロープ *.env.json）
    inbox: join(base, 'inbox'),         // 受信（暗号化エンベロープ *.env.json）
    messages: join(base, 'messages'),   // 復号・検証済の平文メッセージ *.msg.json
    log: join(base, 'log.jsonl'),       // append-only 監査ログ＝実体（ハッシュ連鎖）
  };
}

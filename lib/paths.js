// ~/.middleman レイアウト。
// 専用領域に置く。repo配下・.claude/・task docs配下には絶対に置かない
// （受信文をClaudeが通常ソース文脈と誤認するのを防ぐ＝invariant 1の一部）。

import { homedir } from 'node:os';
import { join } from 'node:path';

// MIDDLEMAN_HOME で差し替え可能（テスト・複数エンドを1マシンに立てる用）。
export function root() {
  return process.env.MIDDLEMAN_HOME || join(homedir(), '.middleman');
}

export function identityPath() {
  return join(root(), 'identity.json'); // 自分の鍵ペア（device_id・ed25519・x25519）
}

export function pairsDir() {
  return join(root(), 'pairs');
}

export function pairDir(pairId) {
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

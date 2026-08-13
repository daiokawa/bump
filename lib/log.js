// 失敗の記録。bumpの最悪の失敗モードは「静かに壊れる」こと（届かない・保存されないのに
// 画面は正常に見える）。実際 pending の保存漏れを握り潰しで隠した前科がある。
//
// 方針: 正常系の握り潰し（ファイルが無ければ既定値）はそのまま。処理・通信・書き込みの失敗だけ
// ここに集め、標準エラーへ出しつつ直近をメモリに残して画面から見えるようにする。

const RING = 50;                 // 直近だけ持つ（増え続けない）
const warnings = [];             // { at, scope, message }

export function warn(scope, err) {
  const message = (err && err.message) || String(err || '');
  const entry = { at: new Date().toISOString(), scope: String(scope || ''), message: message.slice(0, 300) };
  warnings.push(entry);
  if (warnings.length > RING) warnings.shift();
  try { console.error(`[warn] ${entry.scope}: ${entry.message}`); } catch {}
  return entry;
}

// catch にそのまま渡せる形（.catch(warner('scope'))）。
export const warner = (scope) => (err) => { warn(scope, err); };

export function recentWarnings(limit = 20) { return warnings.slice(-limit).reverse(); }
export function clearWarnings() { warnings.length = 0; }

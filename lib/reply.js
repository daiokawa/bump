// 「何への返事か」。ひとこと（クイック返信）は短すぎて、どの手紙への返事か分からない
// （大川さん 2026-10-22: 北原さんの「ありがと！」「こちらこそ！」）。送る側が元の手紙の id を
// re に載せ、受ける側は元の手紙の冒頭1行を添えて見せる。voice-code のひとことも同じ re を使う。
// re の無い旧版からのひとことは、直前にこちらが送った手紙を「たぶんこれ」と控えめに示す。

import { CONTROL_TYPES } from './exchange.js';

export const validRe = (s) => typeof s === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(s);

// 画面（英・日）と voice-code のひとこと。完全一致のときだけ推定する（普通の手紙には推定を付けない）。
const QUICK = new Set(['Got it!', 'Thanks!', 'Likewise!', 'Fair point 🐷', 'Not following…', 'Love it!',
  '了解！', 'ありがと！', 'こちらこそ！', 'それもそうね🐷', 'ちょっと意味わからん', 'それ最高やん']);

const firstLine = (body) => (String(body || '').replace(/^【[^】]*】/, '').split('\n').map((s) => s.trim()).find(Boolean) || '').slice(0, 60);
const isLetter = (m) => !CONTROL_TYPES.includes(m.type);

// msgs: その縁の手紙（古い順）。m への返事先を { id, line, guessed } で返す。無ければ null。
export function replyOf(m, msgs) {
  if (validRe(m.re)) {
    const o = msgs.find((x) => x.id === m.re);
    return o ? { id: o.id, line: firstLine(o.body), guessed: false } : null;
  }
  if (!QUICK.has(String(m.body || '').trim())) return null;
  let best = null;
  for (const x of msgs) {
    if (x.from === m.from || !isLetter(x) || x.created_at >= m.created_at) continue;
    if (QUICK.has(String(x.body || '').trim())) continue;          // ひとこと同士の応酬は飛ばす
    if (!best || x.created_at > best.created_at) best = x;
  }
  return best ? { id: best.id, line: firstLine(best.body), guessed: true } : null;
}

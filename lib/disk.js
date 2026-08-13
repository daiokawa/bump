// ディスクの余裕を見る。bumpは手紙・鍵・ハッシュ連鎖ログを書き続けるので、
// 満杯のまま動くと「手紙が半分だけ書かれる」「ログが壊れる」＝静かな破損が起きる。
// テキストなので普段は問題にならないが、起きた時が最悪なので先に止める（Voyager流）。
//
// 方針: 起動時に足りなければ止める（半端に動かない）。書き込み前に足りなければ受け取らない
// （relayに残るので手紙は失われない。空けてから取りに行ける）。

import { statfs } from 'node:fs/promises';
import { root } from './paths.js';

// 既定のしきい値。手紙はKB単位だが、OSごと不安定になる領域に入る前に止めたいので余裕を見る。
export const MIN_FREE_BYTES = Number(process.env.MM_MIN_FREE || 300 * 1024 * 1024); // 300MB

export async function freeBytes(path = root()) {
  try {
    const s = await statfs(path);
    return Number(s.bavail) * Number(s.bsize);   // 一般ユーザーが使える空き
  } catch { return null; }                        // 測れない環境では判定しない（止めない）
}

// 書き込んでよいか。null（測れない）は true 扱い＝測定不能を理由に止めはしない。
export async function hasRoom(path = root(), min = MIN_FREE_BYTES) {
  const free = await freeBytes(path);
  return free === null ? true : free >= min;
}

export const humanBytes = (n) => {
  if (n === null || n === undefined) return '不明';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${u[i]}`;
};

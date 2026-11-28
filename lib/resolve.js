// 縁を「相手の名前」でも呼べるようにする。縁の名前（フォルダ名）は pair-3c5515 のような内部名の
// こともあり、手元のAIが相手の名前で送ろうとして「未登録」で失敗していた（2026-11-28 草汰さんの Antigravity）。
//
// 引き方: 縁の名前そのもの → 相手の名乗り（プロフィール名）か手元の表示名が一致する縁が1つだけ。
// 「さん」「様」の付け外しと前後の空白は無視する。同じ名前の縁が2つ以上なら、どちらかを縁の名前で
// 指定してもらう（取り違えて別の人に送らないため）。

import { listPairs, readPeer, hasPeer } from './store.js';
import { safePairId } from './paths.js';

const norm = (s) => String(s || '').trim().replace(/\s*(さん|様|さま)$/, '').trim().toLowerCase();

export async function resolvePair(input) {
  const raw = String(input || '').trim();
  if (raw && safePairId(raw) && (await hasPeer(raw))) return raw;
  const want = norm(raw);
  const hits = [], names = [];
  for (const id of await listPairs()) {
    let p; try { p = await readPeer(id); } catch { continue; }
    names.push(p.name ? `${id}（${p.name}）` : id);
    if (want && (norm(p.name) === want || norm(p.alias) === want || norm(id) === want)) hits.push(id);
  }
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new Error(`"${raw}" matches more than one bond: ${hits.join(', ')}. Use the bond name.`);
  throw new Error(`No bond named "${raw}". Bonds: ${names.join(', ') || '(none)'}`);
}

// 新しく結ぶ縁の名前：相手の名乗り。使えない形なら pair-xxxxxx。同じ名前で別の鍵の縁が既にあれば、
// 鍵の頭4文字を添えて分ける（黙って上書きしない）。同じ鍵ならその名前のまま（結び直し）。
export async function pairNameFor(name, deviceId) {
  const n = String(name || '').trim().slice(0, 40);
  const fallback = `pair-${String(deviceId).slice(0, 6)}`;
  if (!n || !safePairId(n)) return fallback;
  let ex = null; try { ex = await readPeer(n); } catch {}
  if (!ex || ex.device_id === deviceId) return n;
  const alt = `${n}-${String(deviceId).slice(0, 4)}`.slice(0, 44);
  return safePairId(alt) ? alt : fallback;
}

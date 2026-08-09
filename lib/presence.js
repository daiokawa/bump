// 到達状態（オンライン●）。presenceは「急かす装置」ではなく「届くかの安心」＋
// 「自分を見せる/隠す主権」として置く（大川さんの原則: デフォルトは隠す＝ステルス）。
// relay に per-pair の心拍を置く。visible な縁にだけ書く。中継は暗号文以外に
// この心拍(device_id と時刻のみ)を預かるが、平文メッセージには触れない。

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FRESH_MS = 90_000; // 90秒以内の心拍なら online（緑）

function presenceDir(relayDir, pairId) {
  return join(relayDir, pairId, 'presence');
}

// 自分の心拍を置く（visible な時だけ呼ぶ）。
export async function beat({ relayDir, pairId, myDeviceId, nowIso }) {
  const dir = presenceDir(relayDir, pairId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${myDeviceId}.json`), JSON.stringify({ ts: nowIso }), 'utf8');
}

// 相手の到達状態を読む。
export async function reachOf({ relayDir, pairId, peerDeviceId, nowIso }) {
  try {
    const raw = await readFile(join(presenceDir(relayDir, pairId), `${peerDeviceId}.json`), 'utf8');
    const { ts } = JSON.parse(raw);
    const online = (Date.parse(nowIso) - Date.parse(ts)) <= FRESH_MS;
    return { online, lastSeen: ts };
  } catch {
    return { online: false, lastSeen: null };
  }
}

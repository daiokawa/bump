// 常駐(daemon)は1つの端に1つだけ。launchd の登録が2組ある・自作ラッパー経由など、どう起動されても
// 実際に動いているかで決める（plist の中身では見分けきれなかった＝Y.K.報告 2026-10-22: ログイン時に2組起動）。
// 取れなかった側は落ちずに待機し、先の方が止まったら引き継ぐ（KeepAlive の再起動ループを作らない）。

import { open, readFile, unlink } from 'node:fs/promises';
import { readFileSync, unlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { root } from './paths.js';

const lockPath = () => join(root(), 'daemon.lock');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// pid が生きていて、それが bump の常駐であるか（pidの使い回しで別プロセスを常駐と取り違えない）。
function isDaemon(pid) {
  if (!pid || pid === process.pid) return Promise.resolve(false);
  try { process.kill(pid, 0); } catch (e) { if (e.code !== 'EPERM') return Promise.resolve(false); }
  return new Promise((resolve) => execFile('ps', ['-p', String(pid), '-o', 'command='], (err, out) =>
    resolve(!err && /\bdaemon\b/.test(out) && /bump/.test(out))));
}

const holder = async () => parseInt(await readFile(lockPath(), 'utf8').catch(() => ''), 10) || 0;
export const ownsDaemonLock = async () => (await holder()) === process.pid;

// 取れるまで待つ。onWait は最初に待機へ回った時に1回だけ呼ぶ（ログ用）。
export async function takeDaemonLock({ onWait, everyMs = 60_000 } = {}) {
  let told = false;
  for (;;) {
    try {
      const fh = await open(lockPath(), 'wx');
      await fh.writeFile(String(process.pid)); await fh.close();
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = await holder();
      if (!(await isDaemon(pid))) { await unlink(lockPath()).catch(() => {}); continue; } // 残骸
      if (!told && onWait) { onWait(pid); told = true; }
      await sleep(everyMs);
    }
  }
  const release = () => { try { if (readFileSync(lockPath(), 'utf8').trim() === String(process.pid)) unlinkSync(lockPath()); } catch {} };
  process.once('exit', release);
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(s, () => process.exit(0));
}

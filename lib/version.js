// 動いている bump の版を短い文字列で返す（例: "0bcda7f"）。相手の画面に「どの版で動いているか」を
// 出すためにプロフィールへ載せる。アプリ組は launcher が書く build.txt、clone 組は git の HEAD。
// 取れなければ空文字（版が分からないだけで、送受信には関係しない）。

import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function appVersion() {
  const stamp = await readFile(join(ROOT, 'build.txt'), 'utf8').catch(() => '');
  const m = stamp.match(/\(([0-9a-f]{7,})\)/);
  if (m) return m[1].slice(0, 7);
  try {
    const { stdout } = await promisify(execFile)('git', ['-C', ROOT, 'rev-parse', '--short=7', 'HEAD'], { timeout: 5000 });
    return /^[0-9a-f]{7}$/.test(stdout.trim()) ? stdout.trim() : '';
  } catch { return ''; }
}

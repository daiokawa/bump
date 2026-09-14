// 旧コードのまま走り続けるMCPプロセスの検知 ── 「名乗り」を新しい側の仕事にする。
//
// mcp.js の updateNotice は旧プロセス自身がその機能を積んでいて初めて名乗れる＝
// 機能が入る前から開きっぱなしのセッションは永久に沈黙する（K.S.指摘 2026-08-22:
// 手元6本中3本が該当。長く開いた席ほど旧コードで、最も名乗ってほしい層が漏れる）。
// そこで常に新版で動くconsole側から ps で数える。適用時刻は launcher が更新のたびに
// 書き直す build.txt の mtime をそのまま使う（新規の記録ファイルは作らない）。
//
// このrepoから起動したプロセスだけ数える。別クローンの席は別の版体系のため対象外。
//
// 適用時刻の取り方は導入形態で変わる：アプリ組は launcher が書く build.txt の mtime、
// git pull 組は build.txt が無い（＝当初は検知が丸ごと無効だった。H.S.指摘 2026-09-14）ので
// reflog の「HEADが最後に動いた時刻」を使う。コミット時刻ではなく reflog なのは、
// 欲しいのが「コードが書かれた時刻」ではなく「この環境に当たった時刻」（＝pullした瞬間）だから。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// { applied_at, stale: [{pid, started_at}] } を返す。適用時刻がどうしても取れなければ検知なし。
export async function staleMcp() {
  let applied;
  try { applied = (await stat(join(ROOT, 'build.txt'))).mtime; }
  catch {
    try {
      const { stdout } = await execFileP('git', ['-C', ROOT, 'log', '-g', '-1', '--date=unix', '--format=%gd'], { timeout: 5000 });
      const m = stdout.match(/@\{(\d+)\}/);
      applied = m ? new Date(Number(m[1]) * 1000) : null;
    } catch { applied = null; }
    if (!applied) return { applied_at: null, stale: [] };
  }
  let stdout = '';
  // lstart はロケール依存（日本語環境では「土  8/22 12:52:14 2026」になる）。LC_ALL=C で
  // "Sat Aug 22 12:52:14 2026" 形式に固定してからパースする。
  try { ({ stdout } = await execFileP('ps', ['-axwwo', 'pid=,lstart=,command='],
    { timeout: 5000, env: { ...process.env, LC_ALL: 'C' } })); }
  catch { return { applied_at: applied.toISOString(), stale: [] }; }
  const marker = join(ROOT, 'bin', 'mcp.js');
  const stale = [];
  for (const line of stdout.split('\n')) {
    if (!line.includes(marker)) continue;
    const m = line.match(/^\s*(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d+:\d+:\d+\s+\d{4})\s/);
    if (!m) continue;
    const started = new Date(m[2]);
    if (!isNaN(started) && started < applied)
      stale.push({ pid: Number(m[1]), started_at: started.toISOString() });
  }
  return { applied_at: applied.toISOString(), stale };
}

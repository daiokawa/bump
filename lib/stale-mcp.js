// 開き直しが要るMCPプロセスの検知。常に新版で動く画面の側から ps で数える。
//
// 2026-11-28 から、MCP の道具の中身（bin/mcp-tools.js）は呼ばれるたびに最新を読む。開き直しが
// 要るのは、入口の bin/mcp.js そのものより前に起動した席だけになった。そこで基準は bin/mcp.js の
// 更新時刻にする（git pull でも、アプリの更新で上書きされても、中身が変わればこの時刻が動く）。
// 以前の build.txt・reflog の時刻は、入口が変わらない更新でも全部の席を「古い」と数えてしまう。
//
// このrepoから起動したプロセスだけ数える。別クローンの席は別の版体系のため対象外。

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
  try { applied = (await stat(join(ROOT, 'bin', 'mcp.js'))).mtime; }
  catch { return { applied_at: null, stale: [] }; }
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

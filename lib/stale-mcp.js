// 守りの直しが入っていないMCPプロセスの検知。常に新版で動く画面の側から ps で数える。
//
// 2026-11-28 から、MCP の道具の中身（bin/mcp-tools.js）は呼ばれるたびに最新を読むので、機能の更新
// のために席をつなぎ直す必要はない。画面に出すのは、守りの直し（SECURITY_FLOOR の版）より前に
// 起動して、古い中身を抱えたまま動いている席だけにする。普段は何も出ない。
// 入口の bin/mcp.js 自体に守りの直しを入れた時だけ、SECURITY_FLOOR をその署名の時刻に進める。
// （利用者の手元に届くのは署名より後なので、届くまでの間に起動した席は数えきれない。十分小さい窓）
//
// このrepoから起動したプロセスだけ数える。別クローンの席は別の版体系のため対象外。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// r2026-11-27（縁の名前・手紙の番号・署名の検証の直し）の署名時刻。
export const SECURITY_FLOOR = new Date('2026-11-27T22:22:01+09:00');

// { applied_at, stale: [{pid, started_at}] } を返す。applied_at＝守りの直しの時刻。
export async function staleMcp() {
  const applied = SECURITY_FLOOR;
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
  // どのタブの席か（端末 tty → tmux のタブ名）。分からなければ出さないだけ。
  if (stale.length) {
    try {
      const ttyOf = {};
      const { stdout: ps2 } = await execFileP('ps', ['-axo', 'pid=,tty='], { timeout: 5000 });
      for (const l of ps2.split('\n')) { const [p, tty] = l.trim().split(/\s+/); if (p && tty && tty !== '??') ttyOf[p] = `/dev/${tty}`; }
      const { stdout: tm } = await execFileP('tmux', ['list-panes', '-a', '-F', '#{pane_tty} #{session_name}'], { timeout: 5000 });
      const tabOf = {}; for (const l of tm.split('\n')) { const i = l.indexOf(' '); if (i > 0) tabOf[l.slice(0, i)] = l.slice(i + 1); }
      for (const x of stale) { const tab = tabOf[ttyOf[String(x.pid)]]; if (tab) x.tab = tab; }
    } catch {}
  }
  return { applied_at: applied.toISOString(), stale };
}

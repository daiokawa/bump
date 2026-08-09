// 起動中の claude cli タブ（tmuxセッション）を発見する。
// Apply の「どのClaudeに読ませますか？」一覧に使う。祖先 claude-bridge の発見ロジックの精簡版。
// 自分のマシンの中だけを見る（他人の端末は一切触れない＝invariant）。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// tmux の全ペイン: session|tty|pid|cwd
async function tmuxPanes() {
  try {
    const { stdout } = await execFileP('tmux', ['list-panes', '-a', '-F',
      '#{session_name}|#{pane_tty}|#{pane_pid}|#{pane_current_path}']);
    return stdout.split('\n').filter(Boolean).map((l) => {
      const [session, tty, pid, cwd] = l.split('|');
      return { session, tty, pid: Number(pid), cwd };
    });
  } catch { return []; }
}

// claude プロセスの tty 集合。
async function claudeTtys() {
  try {
    const { stdout } = await execFileP('ps', ['-axww', '-o', 'tty,command']);
    const ttys = new Set();
    for (const line of stdout.split('\n')) {
      const m = line.match(/^\s*(\S+)\s+(.*)$/);
      if (!m) continue;
      const [, tty, cmd] = m;
      if (/(^|\/)claude(\s|$)|\bclaude\b/.test(cmd) && /claude/.test(cmd)) {
        ttys.add(tty.startsWith('/dev/') ? tty : `/dev/${tty}`);
      }
    }
    return ttys;
  } catch { return new Set(); }
}

// claude が動いている tmux セッション一覧（重複排除・名前でソート）。
export async function listClaudeSessions() {
  const [panes, ttys] = await Promise.all([tmuxPanes(), claudeTtys()]);
  const byName = new Map();
  for (const p of panes) {
    if (!ttys.has(p.tty)) continue;
    if (!byName.has(p.session)) byName.set(p.session, { session: p.session, cwd: p.cwd });
  }
  return [...byName.values()].sort((a, b) => a.session.localeCompare(b.session));
}

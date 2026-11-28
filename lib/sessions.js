// 起動中の手元AIのタブ（tmuxセッション）を見つける。「どのAIに読ませますか？」の一覧に使う。
// 自分のマシンの中だけを見る（他人の端末は一切触れない＝invariant）。
//
// 見分けるのは実行ファイルの名前（またはnodeで動くCLIのスクリプト名）。引数に名前が出てくるだけの
// 別のアプリ（vim claude.md・tail -f claude.log 等）は拾わない。Claude だけを探していたため、
// agy（Antigravity CLI）で受けている人には「流し込めないのでコピーして貼る」になっていた（2026-11-28）。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename } from 'node:path';

const execFileP = promisify(execFile);

// 実行ファイル名 → 画面に出す呼び名
const AI = { claude: 'Claude', antigravity: 'Antigravity', agy: 'Antigravity', gemini: 'Gemini', codex: 'codex' };

// コマンド行から、どの手元AIか（違えば null）。
export function aiOf(cmd) {
  const argv = String(cmd).trim().split(/\s+/);
  const first = basename(argv[0] || '');
  if (AI[first]) return AI[first];
  // node / bun で動くCLI（例: node …/bin/gemini, node …/@google/gemini-cli/dist/index.js）
  if (/^(node|bun)$/.test(first) && argv[1]) {
    const script = argv[1];
    const b = basename(script).replace(/\.(m?js|cjs)$/, '');
    if (AI[b]) return AI[b];
    const m = script.match(/(?:^|\/)(?:@[^/]+\/)?(claude-code|gemini-cli|codex)(?:\/|$)/);
    if (m) return { 'claude-code': 'Claude', 'gemini-cli': 'Gemini', codex: 'codex' }[m[1]];
  }
  return null;
}

// tmux の全ペイン: session|tty|cwd
async function tmuxPanes() {
  try {
    const { stdout } = await execFileP('tmux', ['list-panes', '-a', '-F', '#{session_name}|#{pane_tty}|#{pane_current_path}']);
    return stdout.split('\n').filter(Boolean).map((l) => { const [session, tty, cwd] = l.split('|'); return { session, tty, cwd }; });
  } catch { return []; }
}

// 手元AIのプロセスが動いている端末（tty → AIの呼び名）。
async function aiTtys() {
  const out = new Map();
  try {
    const { stdout } = await execFileP('ps', ['-axww', '-o', 'tty=,command=']);
    for (const line of stdout.split('\n')) {
      const m = line.match(/^\s*(\S+)\s+(.*)$/);
      if (!m || m[1] === '??') continue;
      const ai = aiOf(m[2]);
      if (ai) out.set(m[1].startsWith('/dev/') ? m[1] : `/dev/${m[1]}`, ai);
    }
  } catch {}
  return out;
}

// 手元AIが動いている tmux セッション一覧（重複排除・名前でソート）。ai＝どのAIか（画面に出す）。
export async function listAiSessions() {
  const [panes, ttys] = await Promise.all([tmuxPanes(), aiTtys()]);
  const byName = new Map();
  for (const p of panes) {
    const ai = ttys.get(p.tty);
    if (ai && !byName.has(p.session)) byName.set(p.session, { session: p.session, cwd: p.cwd, ai });
  }
  return [...byName.values()].sort((a, b) => a.session.localeCompare(b.session));
}
export const listClaudeSessions = listAiSessions;   // 旧名（voice-code 等が呼んでいても動くように）

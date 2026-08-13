// 自分のタブのClaudeへ「到達通知」を一言差し込む（tmux）。
// 差し込むのは"新着あり"の通知だけ。相手の本文は絶対に入れない
// （invariant: 通知はよい・入力はしない。本文は人/Claudeが read した時のみ）。
// 注入は祖先 claude-bridge と同方式（load-buffer→paste-buffer -p→Enter）。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileP = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// macOS通知バナー（tmux非依存・アプリ向け）。本文は出さず到達だけ知らせる。
// macOS 以外では静かに何もしない（通知は補助機能。無くても手紙は届く）。
export async function osaNotify(text, title = 'bump') {
  if (process.platform !== 'darwin') return;
  await execFileP('osascript', ['-e',
    `display notification ${JSON.stringify(text)} with title ${JSON.stringify(title)}`]);
}

// Chatworkへの新着通知（Y.K.方式の公式化）。渡すのは「誰から何件」だけ＝本文は載せない。
// トークンは各自の ~/.bump/notify.json にのみ保存（プロフィール伝播には乗せない）。
// self_unread=1: 自分の投稿でも未読バッジを立てる（自分の部屋へ自分で投げる運用のため。Y.Kz.Claude検証 2026-07-22）。
// accountId(任意): あれば [To:id] を前置して「To me」に入れる＝スマホのプッシュ通知も期待できる。
export async function chatworkNotify(token, roomId, text, accountId) {
  const body = accountId ? `[To:${accountId}]${text}` : text;
  const r = await fetch(`https://api.chatwork.com/v2/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: 'POST',
    headers: { 'X-ChatWorkToken': token, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'body=' + encodeURIComponent(body) + '&self_unread=1',
  });
  if (!r.ok) throw new Error(`chatwork ${r.status}`);
}

// 自分のtmuxセッションに1行差し込む。submit=true でEnterまで（着信の手触り）。
export async function tmuxNotify(session, text, submit = true) {
  const buf = `mm-notify-${process.pid}-${Date.now()}`;
  const tmp = join(tmpdir(), `${buf}.txt`);
  await writeFile(tmp, text, 'utf8');
  try {
    await execFileP('tmux', ['load-buffer', '-b', buf, tmp]);
    await execFileP('tmux', ['paste-buffer', '-p', '-d', '-b', buf, '-t', session]);
    if (submit) { await sleep(150); await execFileP('tmux', ['send-keys', '-t', session, 'Enter']); }
  } finally { await unlink(tmp).catch(() => {}); }
}

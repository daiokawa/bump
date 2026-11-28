#!/usr/bin/env node
// bump MCP サーバ（stdio）の入口。手元Claudeとの接続だけを持ち、道具の中身は持たない。
// 呼ばれるたびに bin/mcp-tools.js を別プロセスで起こし、その時点のディスク上の最新コードで答える。
// MCP プロセスは Claude のセッションが開いている間ずっと残るため、中身をここに持つと
// 更新が届かない（2026-11-26 に起動した15本が、11/27 の守りの修正の前のまま動いていた）。
// この入口自体が変わった時だけは開き直しが要るので、その時は毎回の返事で名乗る。
//
// 起動: BUMP_HOME=~/.bump node bin/mcp.js
// 手元Claudeへの登録は claude mcp add か .mcp.json（README参照）。

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const TOOLS_JS = join(dirname(SELF), 'mcp-tools.js');
// 読む前の点検で claude -p を呼ぶため、数分かかることがある。固まった時だけ打ち切る。
const CALL_TIMEOUT_MS = 10 * 60 * 1000;

const selfHash = async () => createHash('sha256').update(await readFile(SELF)).digest('hex');
const BOOT_HASH = await selfHash();
async function entryNotice() {
  if ((await selfHash().catch(() => BOOT_HASH)) === BOOT_HASH) return null;
  return 'The bump MCP entry point was updated after this session started. Tools already run the new code, but restart your Claude session (or reconnect bump in /mcp) to load the new entry point.';
}

// mcp-tools.js を1回起こして、JSON を渡し JSON を受け取る。
function runTools(req) {
  return new Promise((resolve, reject) => {
    const ch = spawn(process.execPath, [TOOLS_JS], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    let out = '', err = '';
    const timer = setTimeout(() => { ch.kill('SIGKILL'); reject(new Error('bump tool timed out')); }, CALL_TIMEOUT_MS);
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    ch.on('error', (e) => { clearTimeout(timer); reject(e); });
    ch.on('close', (code) => {
      clearTimeout(timer);
      let r; try { r = JSON.parse(out); } catch { return reject(new Error(`bump tool failed (exit ${code}): ${err.trim().split('\n').pop() || 'no output'}`)); }
      return r.ok ? resolve(r.result) : reject(new Error(r.error));
    });
    ch.stdin.end(JSON.stringify(req));
  });
}

const server = new Server({ name: 'bump', version: '0.2.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await runTools({ list: true }) }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const notice = await entryNotice();
  try {
    const result = await runTools({ name, args: args || {} });
    if (notice && result && typeof result === 'object') result.update_notice = notice;
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `Error: ${err.message}${notice ? `\n${notice}` : ''}` }] };
  }
});

await server.connect(new StdioServerTransport());

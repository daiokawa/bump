// リリース署名（本家の実印）。自動更新で降ってくるコードを、取り込む前に検証する。
//
// なぜ要るか: Appleの公証が保証するのは「ダブルクリックした瞬間の .app」まで。その後に
// GitHubから重ねるコードは封の外にある（K.K.・Y.K.の指摘 2026-08-15/16）。個人を信じるかでは
// なく、GitHubアカウントが乗っ取られた時に全員へ同時配布される経路を塞ぐ話。
//
// 署名対象は「中身そのもの」＝配布対象ファイルの内容ハッシュを畳んだ1つの値。
// コミットIDに署名すると、古い正しい署名を新しいコードに貼り替えられる（署名とコードが
// 結びつかない）。内容ハッシュならその貼り替えができない。
//
// 形: リポジトリのルートに RELEASE.sig（JSON）。
//   { "tree": "<sha256>", "at": "<ISO8601>", "sig": "<base64 Ed25519>" }
// 検証鍵は同梱の release-pubkey.txt。降ってきた側の鍵は決して使わない。

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createHash, createPublicKey, createPrivateKey, verify as edVerify, sign as edSign } from 'node:crypto';

const b64 = (b) => Buffer.from(b).toString('base64');
const unb64 = (s) => Buffer.from(s, 'base64');
// 署名の対象外。コード以外＝宛先ごとに違って当然のもの（合言葉・宛名・版の刻印・
// 中継URL・配る側の公開鍵）と、署名そのもの。ここを含めると配布物ごとにハッシュが変わり、
// 同じコードでも検証が通らなくなる（2026-08-16の実測）。
// 署名対象は「配布物に実際に入るコード」と同じ集合にする。ここがズレると、同じコードでも
// 検証が通らない（配布物には installer/ や画像が入らない。実測で発覚 2026-08-16）。
// 除外1: 配布物に入らないもの。除外2: 宛先ごとに違って当然のもの（合言葉・宛名・刻印など）。
// installer/ は配布物に同梱する＝走るコード（launch.sh）がここにあるので必ず署名対象。
// 以前これを除外していたため、パッケージから installer が丸ごと落ち、起動不能になった
// （K.S./Y.Kz. 2026-08-16。「shipするもの＝署名するもの」を守れば起きない）。
const SKIP = new Set(['.git', 'node_modules', 'dist', '.DS_Store', 'RELEASE.sig',
  'design', 'relaybox', '.playwright-mcp', 'relay-url.local',
  'invite-token', 'recipient.txt', 'build.txt', 'owner-bundle.json', 'owner-name',
  'relay-url.default', '.mcp.json']);
// 拡張子で落とすもの（ルート直下の作業用画像・ログ）。server/assets の画像は対象に含める。
const SKIP_ROOT_EXT = /\.(png|log)$/i;

// 配布対象ファイルの内容ハッシュを、パス順に畳んだ1つの値。
export async function treeHash(dir) {
  const files = [];
  const walk = async (d) => {
    let names = [];
    try { names = await readdir(d); } catch { return; }
    for (const n of names.sort()) {
      if (SKIP.has(n)) continue;
      const p = join(d, n);
      const st = await stat(p).catch(() => null);
      if (!st) continue;
      if (st.isDirectory()) await walk(p);
      else if (d === dir && SKIP_ROOT_EXT.test(n)) continue;   // ルート直下の作業ファイル
      else files.push(p);
    }
  };
  await walk(dir);
  const h = createHash('sha256');
  for (const p of files.sort()) {
    const rel = relative(dir, p).split(sep).join('/');
    h.update(rel).update('\0').update(createHash('sha256').update(await readFile(p)).digest()).update('\0');
  }
  return h.digest('hex');
}

const payload = (tree, at) => Buffer.from(`${tree}\n${at}`, 'utf8');

export function signTree({ tree, at, privB64 }) {
  const key = createPrivateKey({ key: unb64(privB64), format: 'der', type: 'pkcs8' });
  return { tree, at, sig: b64(edSign(null, payload(tree, at), key)) };
}

// dir の中身を、trustedPubPath の公開鍵で検証する。{ ok, reason, tree }。
export async function verifyReleaseDir(dir, trustedPubPath) {
  let pub, man;
  try { pub = (await readFile(trustedPubPath, 'utf8')).trim(); }
  catch { return { ok: false, reason: 'no trusted public key on this side' }; }
  try { man = JSON.parse(await readFile(join(dir, 'RELEASE.sig'), 'utf8')); }
  catch { return { ok: false, reason: 'no RELEASE.sig in the incoming code' }; }
  if (!man.tree || !man.at || !man.sig) return { ok: false, reason: 'malformed RELEASE.sig' };
  const actual = await treeHash(dir);
  if (actual !== man.tree) return { ok: false, reason: 'code does not match the signed content' };
  let ok = false;
  try {
    const key = createPublicKey({ key: unb64(pub), format: 'der', type: 'spki' });
    ok = edVerify(null, payload(man.tree, man.at), key, unb64(man.sig));
  } catch {}
  return ok ? { ok: true, tree: man.tree } : { ok: false, reason: 'signature does not verify' };
}

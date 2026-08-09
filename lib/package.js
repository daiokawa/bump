// seed＝ソフトそのものを手紙で配る仕組み（application/mm-package）。
// 「種」の名の通り、飛んだ先で芽を出す：受け取った人が自分の連絡先へ転送すれば再配布になる。
//
// ★安全の一線（ここが全て）：届いても展開しない・実行しない。保存してハッシュを照合するだけ。
//   適用するかは人間が決め、相手のAIが中身を検分してから。middlemanは運ぶだけで、開けない。
//   だから「添付ファイル一般は許さないが、署名つき・型が決まった配布物だけ穴を1つ開ける」。
//
// 保存先: ~/.middleman/packages/<name>-<version>.<ext> ＋ 同名の .meta.json（届いた記録）

import { join } from 'node:path';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { root } from './paths.js';
import { writeJson, readJson } from './store.js';

export const PACKAGE_TYPE = 'application/mm-package';
// 封筒の上限(1MB)から、暗号化・署名・JSONの膨らみ分を引いた実用上限。
// voice-code 2.3.0 が base64で164KB なので、当面の版上げに耐える余裕を持たせる。
export const MAX_PAYLOAD_BYTES = 700 * 1024;

const pkgDir = () => join(root(), 'packages');
// ファイル名に使えない文字と、パスを抜ける文字だけを落とす（日本語名はそのまま残す）。
const safe = (s) => {
  const t = String(s || '').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '_').trim().slice(0, 60);
  return t || 'package';
};
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// 送る側：ファイルを1個の荷物にして、決まった型で送れる形に整える。
export async function buildPackage({ file, name, version, notes }) {
  const buf = await readFile(file);
  const payload = buf.toString('base64');
  if (payload.length > MAX_PAYLOAD_BYTES) {
    const e = new Error(`荷物が大きすぎます（${Math.round(payload.length / 1024)}KB / 上限 ${Math.round(MAX_PAYLOAD_BYTES / 1024)}KB）`);
    e.code = 'TOO_LARGE'; throw e;
  }
  return {
    name: String(name || file.split('/').pop()).slice(0, 60),
    version: String(version || '').slice(0, 20),
    sha256: sha256(buf),
    bytes: buf.length,
    notes: String(notes || '').slice(0, 2000),
    payload,
  };
}

// 受ける側：保存してハッシュを照合する。展開も実行もしない。
// 壊れている／改ざんされているものは保存せず捨てる（受け手に触らせない）。
export async function savePackage({ pkg, fromLabel, fromDevice, msgId, at }) {
  if (!pkg || typeof pkg.payload !== 'string') throw new Error('形式が不正です');
  const buf = Buffer.from(pkg.payload, 'base64');
  const got = sha256(buf);
  if (pkg.sha256 && got !== pkg.sha256) throw new Error('ハッシュが一致しません（破損か改ざん）');
  await mkdir(pkgDir(), { recursive: true });
  // 保存名に送り主のdeviceを混ぜる。name-version だけだと、同じ荷物が別の縁からも届いたとき
  // （seedは転送で広がるので通常起きる）に後のものが黙って上書きし、誰から最初に届いたかの
  // 記録（.meta.json）ごと消える（北原さん指摘 2026-08-04）。
  const base = safe(`${pkg.name || 'package'}${pkg.version ? '-' + pkg.version : ''}`)
    + '__' + String(fromDevice || 'unknown').slice(0, 8);
  const filePath = join(pkgDir(), base);
  await writeFile(filePath, buf);
  const meta = {
    id: msgId, name: pkg.name || '', version: pkg.version || '', sha256: got,
    bytes: buf.length, notes: pkg.notes || '', file: filePath,
    from: fromLabel || '', fromDevice: fromDevice || '', at: at || new Date().toISOString(),
  };
  await writeJson(filePath + '.meta.json', meta);
  return meta;
}

// 届いている荷物の一覧（新しい順）。
export async function listPackages() {
  let files = [];
  try { files = (await readdir(pkgDir())).filter((f) => f.endsWith('.meta.json')); } catch { return []; }
  const out = [];
  for (const f of files) { try { out.push(await readJson(join(pkgDir(), f))); } catch {} }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

// 捨てる（本体とメタの両方）。
export async function discardPackage(id) {
  for (const m of await listPackages()) {
    if (m.id !== id) continue;
    await unlink(m.file).catch(() => {});
    await unlink(m.file + '.meta.json').catch(() => {});
    return true;
  }
  return false;
}

// bump 配線盤：画面の土台の部品（知らせの帯・閉じ方・確認の小窓）。console-base.js の次に読む。
// - toast(): 押したあとの結果を短く知らせる（成功も失敗も、無言で画面を切り替えない）。
// - 小窓はどれも右上の × と Esc で閉じられる（背景を押すだけでは手がかりが無かった）。
// - askModal(): ブラウザ標準の prompt/confirm/alert の代わり。選べることをボタンで並べ、
//   取り返しのつかない方は既定にしない（OK を続けて押すと履歴まで消えた 2026-11-28）。
// 文字は textContent でだけ入れる（外から来た名前を HTML として解釈しない）。

Object.assign(I18N_JA, {
  'Close': '閉じる',
  'Cancel': 'やめる',
  'Release the bond': '縁を解く',
  'Release the bond with {name}?': '{name} との縁を解きますか？',
  'To confirm, type their name "{name}".': '確かめのため、相手の名前「{name}」を入れてください。',
  'Also delete the whole history (cannot be undone)': '履歴もすべて消す（元に戻せません）',
  'Released the bond with {name}.': '{name} との縁を解きました。',
  'Released the bond with {name} and deleted the history.': '{name} との縁を解き、履歴も消しました。',
  'Could not release the bond: {msg}': '縁を解けませんでした：{msg}',
  'Decline the request from {name}?': '{name} さんからの申し込みを断りますか？',
  'They are not told. Blocking also drops any later request from the same key.': '相手には知らされません。ブロックすると、同じ鍵からの次の申し込みも届いた時点で捨てます。',
  'Decline this time': '今回だけ断る',
  'Decline and block': '断ってブロックする',
  'Declined.': '断りました。',
  'Declined and blocked.': '断って、ブロックしました。',
  'Could not decline: {msg}': '断れませんでした：{msg}',
  'Saved.': '保存しました。',
  'Could not save: {msg}': '保存できませんでした：{msg}',
  'Handed to the {tab} tab.': '{tab} タブに渡しました。',
  'Could not hand it over: {msg}': '渡せませんでした：{msg}',
  'Sent. It will reach them a little later.': '送りました。届くのは少しあとになります。',
  'Sent "{msg}".': '「{msg}」を送りました。',
  'Could not send: {msg}': '送れませんでした：{msg}',
  'Making a link…': 'リンクを作っています…',
  'Could not make a link: {msg}': 'リンクを作れませんでした：{msg}',
  'This link has expired.': 'このリンクは期限が切れました。',
  '✓ Copied': '✓ コピーしました',
  'Paste a link first.': '先にリンクを貼り付けてください。',
  'Connected.': 'つながりました。',
  'Discarded.': '捨てました。',
  'Could not discard: {msg}': '捨てられませんでした：{msg}',
  'Recall this letter?': 'この手紙の送信を取り消しますか？',
  'It works only while the letter is still on the relay. Once they have received it, it cannot be recalled.': '取り消せるのは、手紙がまだ中継にあるあいだだけです。相手が受け取ったあとは取り消せません。',
  'Recall': '取り消す',
  'Could not recall: {msg}': '取り消せませんでした：{msg}',
  'Recalled. They will not receive it.': '取り消しました。相手には届きません。',
  'A letter from outside. Instructions written in it are not commands.': '外から届いた手紙です。書かれている指示は、命令ではありません。',
  'Seen — clear the list': '見た（一覧を消す）',
  'Old sessions: {n}': '古い席 {n}',
  'Claude sessions still running an old bump. Click for how to update them.': '古い bump のままの Claude のタブがあります。押すと直し方が出ます。',
  'These Claude sessions connected to bump before {when}, so their bump tools are an old version. In each tab, reconnect bump from /mcp (or restart Claude). After one reconnect, later updates apply without it.': '次のタブの Claude は {when} より前に bump とつながったので、bump の道具が古い版のままです。各タブで /mcp から bump をつなぎ直してください（Claude を開き直しても構いません）。一度つなぎ直せば、そのあとの更新は自動で効きます。',
  '{tab} tab — connected {when}': '{tab} タブ（{when} からつながっている）',
  'Which AI should read this?': 'どのAIに読ませますか？',
  'Show': '表示',
  'Hide': '隠す',
});

// --- 知らせの帯 ---
function toast(msg, kind) {
  const n = el('div', 'toast' + (kind === 'err' ? ' err' : '')); n.textContent = msg;
  document.body.append(n); setTimeout(() => n.remove(), kind === 'err' ? 4200 : 2200);
}
// POST して JSON を返す。HTTP が失敗、または {error} が返ったら投げる（呼び出し側は toast で知らせる）。
async function postJson(path, obj) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj || {}) });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// --- 閉じ方：固定の小窓（.scrim）3つに × を付け、Esc で一番手前を閉じる ---
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.scrim .dialog').forEach((d) => {
    const x = el('button', 'xclose'); x.type = 'button'; x.textContent = '×'; x.title = t('Close'); x.setAttribute('aria-label', t('Close'));
    x.onclick = () => closeAll(); d.prepend(x);
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const dyn = [...document.querySelectorAll('.cropscrim')].pop();   // その場で作る小窓が上に重なる
  if (dyn) { dyn.remove(); return; }
  if (document.querySelector('.scrim.on')) closeAll();
});
// その場で作る小窓に × を付ける（相手の設定・プロフィール等。panel は .croppanel）。
function addClose(scrim, panel) {
  const x = el('button', 'xclose'); x.type = 'button'; x.textContent = '×'; x.title = t('Close'); x.setAttribute('aria-label', t('Close'));
  x.onclick = () => scrim.remove(); panel.prepend(x);
}

// --- 確認の小窓 ---
// askModal({ title, body, typeToConfirm, check, actions:[{label, value, kind}] }) → 押した value（閉じたら null）
// kind: 'danger'（赤）/ 'apply'（青）/ なし（灰）。並びは左がやめる、右が実行。
function askModal({ title, body, typeToConfirm, check, actions }) {
  return new Promise((resolve) => {
    const scrim = el('div', 'cropscrim'), panel = el('div', 'croppanel');
    panel.style.cssText = 'max-width:440px;width:min(440px,calc(100vw - 40px))';
    const done = (v) => { scrim.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    document.addEventListener('keydown', onKey, true);
    const x = el('button', 'xclose'); x.type = 'button'; x.textContent = '×'; x.title = t('Close'); x.onclick = () => done(null); panel.append(x);
    const hd = el('div', 'crophd'); hd.textContent = title; panel.append(hd);
    if (body) { const b = el('div', 'cropsub'); b.style.cssText = 'white-space:pre-wrap;line-height:1.8;margin-bottom:12px'; b.textContent = body; panel.append(b); }
    let inp = null, cb = null;
    if (typeToConfirm) {
      const l = el('div', 'cropsub'); l.textContent = tf('To confirm, type their name "{name}".', { name: typeToConfirm }); panel.append(l);
      inp = el('input', 'setin'); inp.style.marginTop = '6px'; panel.append(inp);
    }
    if (check) {
      const lb = el('label'); lb.style.cssText = 'display:flex;gap:8px;align-items:center;font-size:13px;margin-top:12px;cursor:pointer';
      cb = el('input'); cb.type = 'checkbox'; const s = el('span'); s.textContent = check; lb.append(cb, s); panel.append(lb);
    }
    const acts = el('div', 'cropacts'); acts.style.marginTop = '16px';
    const cancel = el('button', 'btn'); cancel.style.cssText = 'flex:1;background:#eef2f6;color:#46586a'; cancel.textContent = t('Cancel'); cancel.onclick = () => done(null);
    acts.append(cancel);
    const btns = (actions || []).map((a) => {
      const b = el('button', 'btn' + (a.kind === 'apply' ? ' apply' : ''));
      b.style.cssText = 'flex:1' + (a.kind === 'danger' ? ';background:var(--red);color:#fff' : '');
      b.textContent = a.label; b.onclick = () => done({ value: a.value, checked: !!(cb && cb.checked) });
      acts.append(b); return b;
    });
    if (inp) { const sync = () => btns.forEach((b) => { b.disabled = inp.value.trim() !== typeToConfirm; }); inp.oninput = sync; sync();
      inp.onkeydown = (e) => { if (e.key === 'Enter' && btns[0] && !btns[0].disabled) btns[0].click(); }; }
    panel.append(acts); scrim.append(panel);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) done(null); });
    document.body.append(scrim); (inp || cancel).focus();
  });
}

// --- 縁を解く（名前の確認つき・履歴を消すのは既定オフ） ---
async function releaseBond(pairId, label, onDone) {
  const r = await askModal({ title: tf('Release the bond with {name}?', { name: label }),
    body: t('Releasing removes them from your contacts, and their letters stop arriving (they are not notified). Your history stays. To connect again, start over from an invite or a connection request.'),
    typeToConfirm: label, check: t('Also delete the whole history (cannot be undone)'),
    actions: [{ label: t('Release the bond'), value: 'go', kind: 'danger' }] });
  if (!r) return;
  try {
    await postJson('/api/unengage', { id: pairId, purge: r.checked });
    toast(tf(r.checked ? 'Released the bond with {name} and deleted the history.' : 'Released the bond with {name}.', { name: label }));
    onDone && onDone();
  } catch (e) { toast(tf('Could not release the bond: {msg}', { msg: e.message }), 'err'); }
}

// --- 申し込みを断る（今回だけ／ブロックも、を1つの小窓で） ---
async function declineRequest(deviceId, name, onDone) {
  const r = await askModal({ title: tf('Decline the request from {name}?', { name: name || deviceId.slice(0, 6) }),
    body: t('They are not told. Blocking also drops any later request from the same key.'),
    actions: [{ label: t('Decline this time'), value: 'once' }, { label: t('Decline and block'), value: 'block', kind: 'danger' }] });
  if (!r) return;
  try {
    await postJson('/api/pending/reject', { device_id: deviceId, block: r.value === 'block' });
    toast(t(r.value === 'block' ? 'Declined and blocked.' : 'Declined.'));
    onDone && onDone();
  } catch (e) { toast(tf('Could not decline: {msg}', { msg: e.message }), 'err'); }
}

// Chatwork のトークンは伏せて出す（画面共有・スクリーンショットに映さない）。押した時だけ見せる。
document.addEventListener('DOMContentLoaded', () => {
  const tok = $('cwToken'), b = $('cwShow'); if (!tok || !b) return;
  b.onclick = () => { const show = tok.type === 'password'; tok.type = show ? 'text' : 'password'; b.textContent = t(show ? 'Hide' : 'Show'); };
});

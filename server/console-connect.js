// bump 配線盤：つながり方の見える化（2026-11-28）。console.js の後に読む。
// - 合言葉が合って自動でつながった相手を、左上のカードで知らせる（心当たりがなければその場で解ける）
// - こちらから申し込んだ相手が、まだ承認していない（＝片側だけの縁）ことを連絡先に出し、もう一度送れる
// - 「つながる」の小窓に、最近作った招待リンクの様子（まだ誰も開いていない／つながった）を出す
// - 貼り付けでつなぐ時も、自分の名前が空なら先に決めてもらう（名無しで相手に届かないように）

Object.assign(I18N_JA, {
  'Connected automatically: {n}': '自動でつながりました：{n}件',
  '{name} used your invite ({at})': '{name} さんがあなたの招待からつながりました（{at}）',
  'Through your invite link': '招待リンクの合言葉が合いました',
  'Through the package you handed over': '渡したパッケージの合言葉が合いました',
  '⚠ Another device also used the same link. If you do not know this person, release the bond.': '⚠ 同じリンクを別の端末も使っています。心当たりがなければ、縁を解いてください。',
  'I know them': '心当たりがある',
  'I do not know them': '心当たりがない',
  'Release the bond with {name} and block them? Their letters so far stay in your history.': '{name} さんとの縁を解いて、ブロックしますか？これまでの手紙は履歴に残ります。',
  'Release and block': '解いてブロックする',
  'Released and blocked.': '縁を解いて、ブロックしました。',
  'Waiting for them to approve': '相手の承認待ち',
  'Waiting for {name} to approve you': '{name} の承認待ちです',
  'You sent a connection request at {at}. Until they approve it, only your side has this bond, and your letters wait on the relay. If they do not seem to have it, send it again.': '{at} に接続を申し込みました。相手が承認するまでは、この縁はこちら側にしかありません。送った手紙は中継で待っています。相手に届いていないようなら、もう一度送ってください。',
  'The request could not be sent. Send it again.': '申し込みを送れませんでした。もう一度送ってください。',
  'Send the request again': '申し込みをもう一度送る',
  'Sent the request again.': '申し込みをもう一度送りました。',
  'Recent invite links': '最近作った招待リンク',
  'Made {at}: not opened yet': '{at} に作成：まだ誰も開いていません',
  'Made {at}: expired, never opened': '{at} に作成：開かれないまま期限切れ',
  'Made {at}: {list}': '{at} に作成：{list}',
  '{name} (connected)': '{name}（つながりました）',
  '{name} (waiting for your approval)': '{name}（あなたの承認待ち）',
  '{name} (released)': '{name}（解いた縁）',
  'Your name (shown to them)': 'あなたの名前（相手の画面に出ます）',
  'Enter your name first. It is shown to them.': '先にあなたの名前を入れてください。相手の画面に出ます。',
});

// --- 自動でつながった相手 ---
async function refreshAuto() {
  let list = []; try { list = await (await fetch('/api/auto')).json(); } catch { return; }
  const box = $('autoBox'); box.textContent = '';
  if (!list.length) { box.style.display = 'none'; return; }
  box.style.display = '';
  const hd = el('div', 'pend-hd'); hd.style.background = 'var(--green)'; hd.textContent = tf('Connected automatically: {n}', { n: list.length }); box.append(hd);
  list.forEach((a) => {
    const row = el('div', 'pend-row');
    const n = el('div', 'pend-name'); n.style.whiteSpace = 'normal'; n.textContent = tf('{name} used your invite ({at})', { name: a.name || a.pair, at: ts(a.at) }); row.append(n);
    const d = el('div', 'pend-sub');
    if (a.conflict) { d.textContent = t('⚠ Another device also used the same link. If you do not know this person, release the bond.'); d.style.color = 'var(--red)'; }
    else { d.textContent = t(a.via === 'invite' ? 'Through the package you handed over' : 'Through your invite link'); d.style.color = 'var(--green)'; }
    row.append(d);
    const btns = el('div', 'pend-btns');
    const no = el('button', 'pend-no'); no.textContent = t('I do not know them');
    no.onclick = async () => {
      const r = await askModal({ title: tf('Release the bond with {name} and block them? Their letters so far stay in your history.', { name: a.name || a.pair }),
        actions: [{ label: t('Release and block'), value: 1, kind: 'danger' }] });
      if (!r) return;
      try { await postJson('/api/auto/undo', { pair: a.pair }); toast(t('Released and blocked.')); } catch (e) { toast(e.message, 'err'); }
      refreshAuto(); loadList(); renderMain();
    };
    const ok = el('button', 'pend-ok'); ok.style.background = 'var(--green)'; ok.textContent = t('I know them');
    ok.onclick = async () => { ok.disabled = true; try { await postJson('/api/auto/ok', { pair: a.pair }); } catch {} refreshAuto(); };
    btns.append(no, ok); row.append(btns); box.append(row);
  });
}
// 申し込みの欄を描き直すたびに、自動でつながった欄も描き直す（同じ周期で十分）。
{ const orig = refreshPending; refreshPending = async (...a) => { await orig(...a); refreshAuto(); }; }
refreshAuto();

// --- こちらから申し込んで、相手の承認待ちの縁 ---
// 連絡先の詳細（console.js の pair の画面）から呼ばれる。承認待ちでなければ何も返さない。
function awaitingCard(P, pairId) {
  if (!P.awaiting) return null;
  const c = el('div', 'card2'); c.style.borderColor = '#f2c38b'; c.style.background = '#fff8ef';
  const h = el('h4'); h.textContent = tf('Waiting for {name} to approve you', { name: P.label || pairId }); c.append(h);
  const d = el('div'); d.style.cssText = 'font-size:12.5px;line-height:1.85;color:var(--muted)';
  d.textContent = P.awaiting.sent ? tf('You sent a connection request at {at}. Until they approve it, only your side has this bond, and your letters wait on the relay. If they do not seem to have it, send it again.', { at: ts(P.awaiting.resent_at || P.awaiting.since) })
    : t('The request could not be sent. Send it again.');
  if (!P.awaiting.sent) d.style.color = 'var(--red)';
  const b = el('button', 'btn apply'); b.style.cssText = 'margin-top:10px;padding:9px 15px;font-size:13px;min-width:0'; b.textContent = t('Send the request again');
  b.onclick = async () => { b.disabled = true; try { await postJson('/api/connect/resend', { id: pairId }); toast(t('Sent the request again.')); renderMain(); } catch (e) { toast(e.message, 'err'); b.disabled = false; } };
  c.append(d, b); return c;
}

// --- 「つながる」の小窓：最近の招待リンクの様子 ---
async function renderRecentInvites() {
  const box = $('recentInv'); if (!box) return; box.textContent = '';
  let list = []; try { list = await (await fetch('/api/invites/recent')).json(); } catch { return; }
  list = list.filter((l) => l.expired || l.used.length);   // 今開いている作りたてのリンクは上に出ているので省く
  if (!list.length) return;
  const h = el('div', 'ilabel'); h.style.marginTop = '14px'; h.textContent = t('Recent invite links'); box.append(h);
  list.forEach((l) => {
    const r = el('div', 'exp'); r.style.margin = '2px 0';
    const names = l.used.map((u) => tf(u.state === 'connected' ? '{name} (connected)' : u.state === 'pending' ? '{name} (waiting for your approval)' : '{name} (released)', { name: u.name }));
    r.textContent = names.length ? tf('Made {at}: {list}', { at: ts(l.created_at), list: names.join('、') })
      : tf(l.expired ? 'Made {at}: expired, never opened' : 'Made {at}: not opened yet', { at: ts(l.created_at) });
    box.append(r);
  });
}
{ const orig = makeInvite; makeInvite = async (...a) => { await orig(...a); renderRecentInvites(); }; }

// --- 貼り付けでつなぐ時の名前 ---
{
  const orig = showPaste;
  showPaste = async (on) => {
    orig(on); if (!on) return;
    const me = await fetch('/api/profile').then((r) => r.json()).catch(() => ({}));
    $('pasteNameRow').style.display = String(me.name || '').trim() ? 'none' : '';
  };
  const go = $('pasteGo'), origGo = go.onclick;
  go.onclick = async () => {
    const row = $('pasteNameRow');
    if (row.style.display !== 'none') {
      const name = $('pasteName').value.trim();
      if (!name) { toast(t('Enter your name first. It is shown to them.'), 'err'); return; }
      try { await postJson('/api/profile', { name }); row.style.display = 'none'; } catch (e) { toast(e.message, 'err'); return; }
    }
    return origGo();
  };
}

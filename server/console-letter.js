// bump 配線盤：手紙の「まだ／済」と、手紙の下の操作（2026-11-28）。console.js より前に読む。
// 済＝手元のAIに渡した・確認した（手元だけ）・読ませなかった（相手に伝わる）。開いただけでは済にしない。
// 下の操作は主役（読ませる）→確認した（済）→読ませない、の順に強弱をつける。
// 手元のAIが1つだけ動いている時は、ボタン自体に渡し先を出して、そのまま渡す（押すのは人のまま）。

Object.assign(I18N_JA, {
  'To handle': 'まだ',
  '✓ Handed to {tab}': '✓ {tab} に渡しました',
  '✓ Checked': '✓ 確認済み',
  '✕ Not handed': '✕ 読ませなかった',
  '✓ Done': '✓ 済',
  'Have {tab} read it': '{tab} に読ませる',
  'Have {tab} read it again': '{tab} にもう一度読ませる',
  'Hand to another AI too': 'ほかのAIにも読ませる',
  'Handed to the {tab} tab.': '{tab} タブに渡しました。',
  'Checked (done)': '確認した（済）',
  'Mark it done here without handing it to an AI. Nothing is sent to them.': '手元のAIに渡さず、ここで済にします。相手には何も送りません。',
  'Marked as done.': '済にしました。',
  'Back to to-do': 'まだに戻す',
  'Ask them directly': '本人に確認',
  '{n} to handle': 'まだ {n}件',
  'Last letter {at}': '最後の手紙 {at}',
  'Automatic reports': '自動報告',
  'Letters from a person': '人の手紙',
  'Their letters are': 'この相手の手紙の区分',
  'Automatic reports (from a watcher or a bot) are listed apart so letters from people do not get buried. Notifications still come the same way.': '見張りや自動の仕組みからの報告を「自動報告」にすると、人の手紙と分けて並び、人の手紙が埋もれません。通知はどちらでも同じように届きます。',
  'More': 'くわしく',
  'bump version': 'bump の版',
  'not reported (older version)': '届いていません（古い版）',
  '{v} (as of {at})': '{v}（{at} 時点）',
  'yours is {v}': 'あなたは {v}',
  'I cannot handle this now': '今は対応できません',
  'Wrong person': 'あて先違いです',
  'Decline without a reason': '理由なしで断る',
  'Or write it in your own words': '自分の言葉で書く場合はこちら',
  'Declined. They were told.': '読ませないことにしました。相手に伝わります。',
  'Not this one': '読ませない',
  'Set': '設定済み',
});

function letterState(it) {
  if (it.triage === 'applied') return it.handed_to ? tf('✓ Handed to {tab}', { tab: it.handed_to }) : t('✓ Handed');
  if (it.triage === 'declined') return t('✕ Not handed');
  if (it.triage === 'done') return t('✓ Checked');
  return it.done ? t('✓ Done') : t('To handle');
}

// 連絡先の詳細の見出しの下：次にすることと、最後のやり取り（到達の丸は中継では分からないので出さない）。
function pairMeta(P, p) {
  const out = [];
  if (p.unread) out.push(tf('{n} to handle', { n: p.unread }));
  if (p.lastActivity) out.push(tf('Last letter {at}', { at: ts(p.lastActivity) }));
  if ((P.category || p.category) === 'report') out.push(t('Automatic reports'));
  return out.join(' · ');
}

async function letterActions(s, L) {
  const acts = el('div', 'm-actions');
  let tabs = []; try { tabs = await (await fetch('/api/tabs')).json(); } catch {}
  const handed = s.triage === 'applied', finished = !!s.done;
  const after = (patch, msg) => { Object.assign(s, patch); toast(msg); refreshBadge(); loadList(); renderMain(); };
  const ap = el('button', 'btn ' + (finished ? 'decline' : 'apply'));
  if (tabs.length === 1) {
    const tb = tabs[0].session;
    ap.textContent = tf(handed ? 'Have {tab} read it again' : 'Have {tab} read it', { tab: tb });
    ap.onclick = async () => { ap.disabled = true;
      try { await postJson('/api/apply', { pair: s.pair, id: s.id, tab: tb }); after({ triage: 'applied', done: true, handed_to: tb }, tf('Handed to the {tab} tab.', { tab: tb })); }
      catch (e) { toast(tf('Could not hand it over: {msg}', { msg: e.message }), 'err'); ap.disabled = false; } };
  } else {
    ap.textContent = handed ? t('Hand to another AI too') : t('Hand to my AI');
    ap.onclick = () => openTabs(s.pair, s.id);
  }
  acts.append(ap);
  const dn = el('button', 'btn verify');
  if (!finished) {
    dn.textContent = t('Checked (done)'); dn.title = t('Mark it done here without handing it to an AI. Nothing is sent to them.');
    dn.onclick = async () => { dn.disabled = true;
      try { await postJson('/api/done', { pair: s.pair, id: s.id }); after({ triage: 'done', done: true }, t('Marked as done.')); }
      catch (e) { toast(e.message, 'err'); dn.disabled = false; } };
    acts.append(dn);
    const dc = el('button', 'btn'); dc.style.cssText = 'background:none;color:var(--muted);min-width:0;flex:0 0 auto;padding-left:10px;padding-right:10px';
    dc.textContent = t('Not this one'); dc.onclick = () => openDecline(s.pair, s.id);
    acts.append(dc);
  } else if (s.triage === 'done') {
    dn.textContent = t('Back to to-do');
    dn.onclick = async () => { dn.disabled = true;
      try { await postJson('/api/done', { pair: s.pair, id: s.id, undo: true }); after({ triage: '', done: false }, t('Back to to-do')); }
      catch (e) { toast(e.message, 'err'); dn.disabled = false; } };
    acts.append(dn);
  }
  return acts;
}

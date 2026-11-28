// bump 配線盤：着信の検索（2026-11-28）。console.js の後に読む。
// 見張りの報告などが多いと目当ての手紙が埋もれるので、送り主の名前と本文で絞り込む。
// 探すのは手元の画面（127.0.0.1）の中だけ。検索語は URL に載せず POST で送り、探しても既読にしない。

Object.assign(I18N_JA, {
  'No letters match “{q}”.': '「{q}」に当てはまる手紙はありません。',
  '{n} found': '{n}件',
});

let sq = '', sHits = null, sSeq = 0, sKey = '', sTimer = 0;
const inboxKey = () => (cache.inbox || []).length + ':' + ((cache.inbox || [])[0] || {}).id;

async function runSearch() {
  const q = sq.trim();
  if (!q) { sHits = null; sSeq++; renderList(); return; }
  const my = ++sSeq; let r;
  try { r = await postJson('/api/inbox/search', { q }); } catch { return; }
  if (my !== sSeq) return;                       // 打ち進めた後の結果だけ使う
  sHits = new Map(r.map((h) => [h.pair + '\n' + h.id, h.hit]));
  sKey = inboxKey(); renderList();
}

{
  const q = $('inboxQ');
  q.addEventListener('input', () => { sq = q.value; clearTimeout(sTimer); sTimer = setTimeout(runSearch, 220); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape' && q.value) { e.stopPropagation(); q.value = ''; sq = ''; runSearch(); } });
}

// 一覧の描き方はそのまま、着信を当たった手紙だけに絞って描く。新しい手紙が来たら探し直す。
{
  const orig = renderList;
  renderList = function () {
    $('searchRow').style.display = section === 'inbox' ? '' : 'none';
    const cnt = $('searchCount');
    if (section !== 'inbox' || !sHits || !sq.trim()) { cnt.textContent = ''; return orig(); }
    if (inboxKey() !== sKey) runSearch();
    const all = cache.inbox;
    cache.inbox = all.filter((it) => sHits.has(it.pair + '\n' + it.id))
      .map((it) => { const h = sHits.get(it.pair + '\n' + it.id); return h ? { ...it, snip: h } : it; });
    cnt.textContent = tf('{n} found', { n: cache.inbox.length });
    try {
      if (!cache.inbox.length) { $('list').textContent = ''; return listEmpty(tf('No letters match “{q}”.', { q: sq.trim() })); }
      return orig();
    } finally { cache.inbox = all; }
  };
}

// bump 配線盤：着信の絞り込みと並び（2026-11-28）。console.js の後に読む。
// - 人の手紙／自動報告：相手ごとの区分で分けて並べる（見張りの報告で人の手紙が埋もれないように）。
//   自動報告の相手がいない人には切り替えを出さない。通知はどちらも同じように届く。
// - 検索：送り主の名前と本文。探すのは手元の画面（127.0.0.1）の中だけ。検索語は URL に載せず POST で送り、
//   探しても既読にしない。
// - 並び順：まだを上に（既定）／新しい順／古い順／送り主ごと。選んだものはこの画面に覚えておく。

Object.assign(I18N_JA, {
  'No letters match “{q}”.': '「{q}」に当てはまる手紙はありません。',
  '{n} found': '{n}件',
  'Nothing here.': 'ここにはまだ手紙がありません。',
});

let sq = '', sHits = null, sSeq = 0, sKey = '', sTimer = 0;
let cat = 'person';
let sortBy = (() => { try { return localStorage.getItem('bump.inboxSort') || 'todo'; } catch { return 'todo'; } })();
const inboxKey = () => (cache.inbox || []).length + ':' + ((cache.inbox || [])[0] || {}).id;
const hasReports = () => (cache.inbox || []).some((x) => x.category === 'report');

async function runSearch() {
  const q = sq.trim();
  if (!q) { sHits = null; sSeq++; renderList(); return; }
  const my = ++sSeq; let r;
  try { r = await postJson('/api/inbox/search', { q }); } catch { return; }
  if (my !== sSeq) return;                       // 打ち進めた後の結果だけ使う
  sHits = new Map(r.map((h) => [h.pair + '\n' + h.id, h.hit]));
  sKey = inboxKey(); renderList();
}

// 未読へ飛ぶ時など、その手紙の区分へ切り替える（console.js の refreshBadge から呼ぶ）。
function showCategory(c) { if (c && c !== cat && hasReports()) { cat = c; renderList(); } }

function syncCat() {
  const seg = $('catSeg'), on = section === 'inbox' && hasReports();
  seg.style.display = on ? '' : 'none';
  if (!on) return;
  [...seg.children].forEach((x) => {
    x.classList.toggle('active', x.dataset.c === cat);
    const n = (cache.inbox || []).filter((i) => i.category === x.dataset.c && !i.done).length;
    x.querySelector('.cn').textContent = n || '';
  });
}

const SORTS = {
  todo: (a, b) => (a.done === b.done ? (a.at < b.at ? 1 : -1) : (a.done ? 1 : -1)),
  new: (a, b) => (a.at < b.at ? 1 : -1),
  old: (a, b) => (a.at < b.at ? -1 : 1),
  sender: (a, b) => (String(a.label || a.pair).localeCompare(String(b.label || b.pair), 'ja') || (a.at < b.at ? 1 : -1)),
};

{
  const q = $('inboxQ');
  q.addEventListener('input', () => { sq = q.value; clearTimeout(sTimer); sTimer = setTimeout(runSearch, 220); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Escape' && q.value) { e.stopPropagation(); q.value = ''; sq = ''; runSearch(); } });
  const so = $('inboxSort'); so.value = SORTS[sortBy] ? sortBy : 'todo';
  so.onchange = () => { sortBy = so.value; try { localStorage.setItem('bump.inboxSort', sortBy); } catch {} renderList(); };
  $('catSeg').onclick = (e) => { const c = e.target.closest('.t')?.dataset.c; if (c && c !== cat) { cat = c; renderList(); } };
}

// 一覧の描き方はそのまま、着信を「区分→検索→並び順」で整えてから描く。新しい手紙が来たら探し直す。
{
  const orig = renderList;
  renderList = function () {
    $('searchRow').style.display = section === 'inbox' ? '' : 'none';
    syncCat();
    const cnt = $('searchCount');
    if (section !== 'inbox') { cnt.textContent = ''; return orig(); }
    const all = cache.inbox || [];
    let view = hasReports() ? all.filter((i) => i.category === cat) : all.slice();
    const searching = !!(sHits && sq.trim());
    if (searching) {
      if (inboxKey() !== sKey) runSearch();
      view = view.filter((it) => sHits.has(it.pair + '\n' + it.id))
        .map((it) => { const h = sHits.get(it.pair + '\n' + it.id); return h ? { ...it, snip: h } : it; });
    }
    view.sort(SORTS[sortBy] || SORTS.todo);
    cnt.textContent = searching ? tf('{n} found', { n: view.length }) : '';
    cache.inbox = view;
    try {
      if (!view.length && all.length) {
        $('list').textContent = '';
        return listEmpty(searching ? tf('No letters match “{q}”.', { q: sq.trim() }) : t('Nothing here.'));
      }
      return orig();
    } finally { cache.inbox = all; }
  };
}

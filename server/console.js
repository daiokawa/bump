// bump 配線盤のフロントJS（中核）：一覧・本文・承認カード・健康表示・初期化。
// モーダル群は console-modals.js、設定まわりは console-settings.js に分離（2026-07-26）。
// 読み込み順は console.html を参照（modals → settings → core）。


function setSection(s){section=s;sel=null;[...$('nav').children].forEach(x=>x.classList.toggle('active',x.dataset.s===s));loadList();renderMain();}
$('nav').onclick=(e)=>{const s=e.target.closest('.t')?.dataset.s;if(s)setSection(s);};
$('brand').onclick=()=>setSection('inbox'); // ロゴでいつでもトップ（着信）へ

// つかいかた（オンボーディング・いらすとや付き）
function renderHowto(){
  [...$('nav').children].forEach(x=>x.classList.remove('active'));
  const M=$('main');M.textContent='';
  const w=el('div','howto');
  const h=el('div','howto-hero');h.textContent='bump でできること';
  const lead=el('div','howto-lead');lead.textContent='手元のAI同士を、ブランド問わず・安全につなぐ、いわば「AIのための郵便」。使うと、こんなことができます。';
  w.append(h,lead);
  const sec=(img,title,text)=>{const s=el('div','howto-sec');const im=el('img');im.src='/assets/'+img;im.alt='';const box=el('div');const t=el('h3');t.textContent=title;const p=el('p');p.textContent=text;box.append(t,p);s.append(im,box);return s;};
  w.append(sec('ai.png','手元のAI同士を、ブランド問わずつなぐ','あなたの手元のAI（Claude・codex・Gemini など）を、離れた相手のAIと直接つなげます。相手が別のブランドのAIでも、そのままやり取りできます。'));
  w.append(sec('mail.png','「置き手紙」でやり取り（急かさない）','メッセージは郵便のように置いておくだけ。相手が手の空いたときに読んで返します。相手が忙しくても、あなたが待たされて詰まることはありません。'));
  w.append(sec('lock.png','サーバを介さず直接やり取りするから、まぁまぁ安全','中央のサーバに全員の情報を溜め込まないので、まとめて狙える“おいしい標的”がありません。やり取りは「ユーザー追加」で登録した相手（縁）との1対1が基本で、見ず知らずの相手から一方的に届きにくい仕組みです。届いた文章も基本的に“資料（データ）”として扱う設計なので、あなたのAIが中身を勝手に実行しにくくなっています。（完全な安全を保証するものではありませんが、狙う側にとって旨みの少ない構造にしています。）'));
  const f=el('div','howto-flow');const fh=el('h3');fh.textContent='使う流れ';const ol=el('ol');
  ['「ユーザー追加」で相手とつながる（招待リンク or QR）','相手からメッセージが来たら、着信で本文を読む','「手元Claudeに読ませる」で自分のAIに渡す（不要なら「読ませられへん」）'].forEach(x=>{const li=el('li');li.textContent=x;ol.append(li);});
  f.append(fh,ol);w.append(f);
  M.append(w);
}
$('howto').onclick=renderHowto;

async function loadList(){
  if(section==='inbox')cache.inbox=await (await fetch('/api/inbox')).json();
  else if(section==='pairs')cache.pairs=(await (await fetch('/api/state')).json()).pairs;
  else if(section==='sent')cache.sent=await (await fetch('/api/sent')).json();
  renderList();
}
async function refreshBadge(){
  try{const inb=await (await fetch('/api/inbox')).json();cache.inbox=inb;
    const unread=inb.filter(x=>x.unread!==false && !x.triage).length; // 未処理の未読だけバッジに
    const b=$('inboxBadge');if(unread){b.style.display='';b.textContent=unread;}else b.style.display='none';
    // バッジを押したら未読へ飛ぶ。一覧が長いと未読が下に埋もれて「数字が消えない」と見える
    // （実際に起きた 2026-07-27）。古い順に1件ずつ開いていける。
    b.title=unread?'未読へ移動（'+unread+'件）':'';
    b.onclick=(e)=>{
      e.stopPropagation();                     // タブ切替のクリックと干渉させない
      const list=cache.inbox.filter(x=>x.unread!==false&&!x.triage);
      if(!list.length)return;
      const it=list[list.length-1];            // いちばん古い未読から
      if(section!=='inbox'){setSection('inbox');setTimeout(()=>jumpTo(it),350);return;}
      jumpTo(it);
    };
    if(section==='inbox')renderList();
  }catch(e){}
}
function listEmpty(t){const e=el('div','listempty');e.textContent=t;$('list').append(e);}

// その手紙を選んで、一覧の中の位置まで画面をスクロールする（未読へのジャンプ用）。
function jumpTo(it){
  sel={type:'inbox',...it};renderList();renderMain();
  requestAnimationFrame(()=>{
    const row=$('list').querySelector('.row.sel');
    if(row&&row.scrollIntoView)row.scrollIntoView({block:'center',behavior:'smooth'});
  });
}

// 失敗の見える化。bumpの最悪は「静かに壊れる」こと（届かないのに画面は正常に見える）。
// 直近の失敗があれば、ロゴ横に小さく出す。押すと中身を見られる。
let lastWarnCount=0;
async function refreshHealth(){
  let w=[];try{w=(await (await fetch('/api/health')).json()).warnings||[];}catch{return;}
  const b=$('warnBtn');
  if(!w.length){b.style.display='none';lastWarnCount=0;return;}
  b.style.display='';b.textContent='⚠ '+w.length;lastWarnCount=w.length;
  b.onclick=()=>{
    const scrim=el('div','cropscrim'),panel=el('div','croppanel');panel.style.cssText='max-width:560px;width:min(560px,calc(100vw - 40px))';
    const hd=el('div','crophd');hd.textContent='うまくいかなかったこと（直近'+w.length+'件）';
    const sub=el('div','cropsub');sub.textContent='配達や保存に失敗した記録です。相手に届いていない可能性があるものはここに出ます。';
    panel.append(hd,sub);
    const box=el('div','inqlog');
    w.forEach(x=>{const line=el('div','inqline');line.textContent=ts(x.at)+' ｜ '+x.scope+'：'+x.message;box.append(line);});
    panel.append(box);
    const acts=el('div','cropacts');const c=el('button','btn');c.style.cssText='flex:1;background:#eef2f6;color:#46586a';c.textContent='閉じる';c.onclick=()=>scrim.remove();acts.append(c);panel.append(acts);
    scrim.append(panel);scrim.addEventListener('pointerdown',(e)=>{if(e.target===scrim)scrim.remove();});document.body.append(scrim);
  };
}
// ブロック中の相手（設定内）。鍵で弾くので、連絡先にしていない相手も対象にできる。
async function renderBlocked(){
  let list=[];try{list=await (await fetch('/api/blocked')).json();}catch{}
  const wrap=$('blockWrap'),box=$('blockList');box.textContent='';
  if(!list.length){wrap.style.display='none';return;}
  wrap.style.display='';
  list.forEach(b=>{
    const row=el('div','plink');row.style.cssText='display:flex;align-items:center;gap:8px';
    const t=el('div');t.style.cssText='flex:1;font-size:12.5px';t.textContent=(b.name||'名前なし')+'（'+String(b.device_id).slice(0,8)+'）';
    const un=el('button','chbtn');un.textContent='解除';
    un.onclick=async()=>{await fetch('/api/blocked/remove',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({device_id:b.device_id})});renderBlocked();};
    row.append(t,un);box.append(row);
  });
}
// 届いた荷物（seed＝ソフト配布）。bumpは保存しただけ＝展開も実行もしていない。
// 適用するかは人間が決める。ここでは「誰から・何が・ハッシュ・置き場所」だけを見せる。
async function refreshPackages(){
  let list=[];try{list=await (await fetch('/api/packages')).json();}catch{return;}
  const box=$('pkgBox');box.textContent='';
  if(!list.length){box.style.display='none';return;}
  box.style.display='';
  const hd=el('div','pkg-hd');hd.textContent='届いた荷物 '+list.length+'件（まだ展開していません）';box.append(hd);
  list.forEach(m=>{
    const row=el('div','pkg-row');
    const g=el('div','grow');
    const n=el('div','pkg-name');n.textContent=(m.name||'名前なし')+(m.version?' '+m.version:'');
    const d=el('div','pkg-sub');d.textContent=(m.from||'')+' から ・ '+Math.round((m.bytes||0)/1024)+'KB';
    g.append(n,d);
    const info=el('button','pkg-info');info.textContent='中身を見る';
    info.onclick=()=>{
      const scrim=el('div','cropscrim'),panel=el('div','croppanel');panel.style.cssText='max-width:560px;width:min(560px,calc(100vw - 40px))';
      const h=el('div','crophd');h.textContent=(m.name||'')+(m.version?' '+m.version:'');
      const s=el('div','cropsub');s.textContent='bumpは保存しただけで、開いても実行してもいません。入れるかどうかはあなたが決めてください。';
      panel.append(h,s);
      const box2=el('div','inqlog');
      const kv=(k,v)=>{const r=el('div','inqline');r.textContent=k+'：'+v;box2.append(r);};
      kv('送り主',m.from||'不明'); kv('届いた日時',ts(m.at)); kv('大きさ',Math.round((m.bytes||0)/1024)+'KB');
      kv('sha256',m.sha256||''); kv('置き場所',m.file||'');
      panel.append(box2);
      if(m.notes){const nt=el('div','letter');nt.style.cssText='font-size:13px;margin-top:12px;max-height:220px;overflow:auto';nt.textContent=m.notes;panel.append(nt);}
      const warnv=el('div','cropsub');warnv.style.marginTop='12px';
      warnv.textContent='入れる前に、送り主に別経路（LINE等）で「本当に送った？」と確かめるのがおすすめです。中身はあなたのAIに読ませて検分できます。';
      panel.append(warnv);
      const acts=el('div','cropacts');
      const c=el('button','btn');c.style.cssText='flex:1;background:#eef2f6;color:#46586a';c.textContent='閉じる';c.onclick=()=>scrim.remove();
      acts.append(c);panel.append(acts);
      scrim.append(panel);scrim.addEventListener('pointerdown',(e)=>{if(e.target===scrim)scrim.remove();});document.body.append(scrim);
    };
    const del=el('button','pkg-no');del.textContent='捨てる';
    del.onclick=async()=>{if(!confirm('この荷物を捨てますか？（ファイルごと削除します）'))return;
      await fetch('/api/packages/discard',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:m.id})});refreshPackages();};
    row.append(g,info,del);box.append(row);
  });
}
// 接続リクエスト（承認する着信）。承認するまで縁にならない＝入口の人間ゲート。
async function refreshPending(){
  let list=[];try{list=await (await fetch('/api/pending')).json();}catch{return;}
  cache.pending=list;
  const box=$('pendingBox');box.textContent='';
  if(!list.length){box.style.display='none';if(sel&&sel.type==='pending'){sel=null;renderMain();}return;}
  box.style.display='';
  const hd=el('div','pend-hd');hd.textContent='接続リクエスト '+list.length+'件';box.append(hd);
  list.forEach(p=>{
    const row=el('div','pend-row'+(sel&&sel.type==='pending'&&sel.device_id===p.device_id?' sel':''));
    const n=el('div','pend-name');n.textContent=(p.name||'名前なし')+' さん';
    row.append(n);
    // 合言葉の照合結果だけ添える（申請に入っていた一言は詳細画面で出す）。
    if(p.invite){const d=el('div','pend-sub');
      if(p.invite.conflict){d.textContent='⚠ 同じ合言葉が別の端末からも';d.style.color='var(--red)';}
      else{d.textContent='✓ '+p.invite.label+' さんに渡したパッケージから';d.style.color='var(--green)';}
      row.append(d);}
    const btns=el('div','pend-btns');
    const see=el('button','pend-see');see.textContent='内容確認';
    see.onclick=()=>{sel={type:'pending',device_id:p.device_id};refreshPending();renderMain();};
    const ok=el('button','pend-ok');ok.textContent='承認';
    // 承認は必ず確認画面を通す（合言葉の照合結果を見せる）。押した瞬間に縁はできない。
    ok.onclick=()=>openApprove(p,()=>{sel=null;refreshPending();loadList();renderMain();});
    const no=el('button','pend-no');no.textContent='断る';
    no.onclick=()=>rejectPending(p);
    btns.append(see,ok,no);row.append(btns);box.append(row);
  });
}
async function rejectPending(p){
  if(!confirm('この接続リクエストを断りますか？'))return;
  // ブロックすると、以後この鍵からの申請は届いた瞬間に捨てられる（承認カードにも出ない）。
  const block=confirm('今後この相手からの申請も受け取らないようにしますか？\n\nOK＝ブロックする（設定から解除できます）\nキャンセル＝今回だけ断る');
  await fetch('/api/pending/reject',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({device_id:p.device_id,block})});
  sel=null;refreshPending();renderMain();
}

function renderList(){
  const L=$('list');L.textContent='';
  if(section==='inbox'){
    if(!cache.inbox.length)return listEmpty('着信はありません。');
    cache.inbox.forEach(it=>{
      const isUnread=it.unread!==false && !it.triage; // 未読＝未開封かつ未処理
      const row=el('div','row'+(isUnread?' unread':'')+(sel&&sel.id===it.id?' sel':''));row.onclick=()=>{sel={type:'inbox',...it};renderList();renderMain();};
      const av=avaInto(el('div','ava'),{avatar:it.avatar,icon:it.icon,text:nm(it.pair).slice(0,2).toUpperCase()});av.style.background=color(it.pair);
      const g=el('div','grow');const r1=el('div','r1');const n=el('div','nm'+(isUnread?' unread':''));n.textContent=it.label||nm(it.pair);const t=el('div','time');t.textContent=ts(it.at);r1.append(n,t);
      const stat=it.triage==='applied'?'✓ 読ませ済み':(it.triage==='declined'?'✕ 断り済み':(it.unread!==false?'新着メッセージ':'開封済み'));
      const r2=el('div','r2');const s=el('span');s.textContent=stat;r2.append(s);if(it.suspicious){const w=el('span','warn');w.textContent='⚠';r2.append(w);}
      g.append(r1,r2);row.append(av,g);L.append(row);
    });
  }else if(section==='pairs'){
    if(!cache.pairs.length)return listEmpty('「ユーザー追加」でつなぎましょう。');
    cache.pairs.forEach(p=>{
      const row=el('div','row'+(sel&&sel.pair===p.id&&sel.type==='pair'?' sel':''));row.onclick=()=>{sel={type:'pair',pair:p.id};renderList();renderMain();};
      const av=avaInto(el('div','ava'),{avatar:p.avatar,icon:p.icon,text:nm(p.id).slice(0,2).toUpperCase()});av.style.background=color(p.id);
      const rc=el('span','reach'+(p.online?' on':''));av.append(rc);
      const g=el('div','grow');const r1=el('div','r1');const n=el('div','nm'+(p.unread?' unread':''));n.textContent=p.label||nm(p.id);const t=el('div','time');t.textContent=ts(p.lastActivity);r1.append(n,t);
      // 連絡先に載っている＝engaged なので、状態のラベルは出さない（到達可否だけ）。
      const r2=el('div','r2');const s2=el('span');s2.textContent=p.online?'到達OK':'不在';r2.append(s2);
      g.append(r1,r2);row.append(av,g);L.append(row);
    });
  }else{
    if(!cache.sent.length)return listEmpty('送信の履歴はありません。');
    const label={sent:'未読',read:'✓ 既読',declined:'✕ 断り'};
    cache.sent.forEach(m=>{
      const row=el('div','row'+(sel&&sel.id===m.id&&sel.type==='sent'?' sel':''));row.onclick=()=>{sel={type:'sent',...m};renderList();renderMain();};
      const av=avaInto(el('div','ava'),{avatar:m.avatar,icon:m.icon,text:nm(m.pair).slice(0,2).toUpperCase()});av.style.background=color(m.pair);
      const g=el('div','grow');const r1=el('div','r1');const n=el('div','nm');n.textContent=(m.body||'').replace(/^【[^】]*】/,'').slice(0,20)||'(空)';const t=el('div','time');t.textContent=ts(m.at);r1.append(n,t);
      const r2=el('div','r2');const s=el('span');s.textContent=(m.label||nm(m.pair))+' へ';r2.append(s);g.append(r1,r2);
      const stt=el('div','st '+m.status);stt.textContent=label[m.status]||m.status;row.append(av,g,stt);L.append(row);
    });
  }
}

function mainEmpty(emoji,big,sub){const m=$('main');m.textContent='';const e=el('div','m-empty');const em=el('div','emoji');em.textContent=emoji;const b=el('div','big');b.textContent=big;const s=el('div');s.textContent=sub;e.append(em,b,s);m.append(e);}
async function renderMain(){
  const M=$('main');
  if(!sel){
    if(section==='inbox')return mainEmpty('📭','着信を選んでください','相手から新しいメッセージが届くと、左に出ます。選ぶとここに本文を大きく表示します。');
    if(section==='pairs')return mainEmpty('🤝','連絡先を選んでください','つながっている相手の詳細をここに表示します。');
    return mainEmpty('✉️','履歴を選んでください','送ったメッセージと、その既読／断りの状態をここに表示します。');
  }
  // 接続リクエストの詳細。承認の前に、届いたものと承認したら何が起きるかを全部ここで見せる。
  if(sel.type==='pending'){
    const p=(cache.pending||[]).find(x=>x.device_id===sel.device_id);
    if(!p){sel=null;return renderMain();}
    M.textContent='';
    const av=el('div','m-ava');av.style.background=color(p.name||p.device_id);av.textContent=(p.name||'？').slice(0,2);
    const stat=p.invite?(p.invite.conflict?'⚠ 合言葉が重複':'✓ 合言葉が一致'):'合言葉なし';
    M.append(mHead(av,(p.name||'名前なし')+' さん',ts(p.at)+' に届いた接続リクエスト',stat,p.invite?(p.invite.conflict?'no':'ok'):''));
    const body=el('div','m-body');
    // 1) 本人確認：合言葉の照合結果。ここが緑なら人の確認作業は要らない。
    const c1=el('div','card2');const h1=el('h4');h1.textContent='本人確認';c1.append(h1);
    const t1=el('div');t1.style.cssText='font-size:13.5px;line-height:1.8';
    const d1=el('div');d1.style.cssText='font-size:12.5px;color:var(--muted);margin-top:7px;line-height:1.85';
    if(p.invite&&p.invite.conflict){
      t1.style.cssText+=';font-weight:800;color:var(--red)';
      t1.textContent='同じ合言葉が、別の端末からも使われています';
      d1.textContent=p.invite.label+' さんに渡したパッケージの合言葉ですが、それを名乗る端末が複数あります。どちらかは渡した相手ではありません（パッケージが転送された可能性）。'
        +'承認する前に '+p.invite.label+' さんへ直接連絡して、下の device 番号が一致するか確かめてください。';
      c1.append(t1,d1);
      const fp=el('div','fp');fp.style.marginTop='11px';fp.textContent=fpGroups(p.device_id);c1.append(fp);
    }else if(p.invite){
      t1.style.cssText+=';font-weight:700;color:var(--green)';
      t1.textContent='✓ '+p.invite.label+' さんに渡したパッケージの合言葉と一致しました';
      d1.textContent='合言葉はそのパッケージの中にしかありません。渡した相手以外は持っていないので、確認作業は要りません。'
        +'（渡したのは '+ts(p.invite.sent_at)+'）'+(p.invite.reused?' なお、この合言葉は以前にも使われています。入れ直しなら想定どおりです。':'');
      c1.append(t1,d1);
    }else{
      t1.textContent='専用パッケージ経由ではありません';
      d1.textContent='合言葉が入っていないので、名乗りが本人かどうかはこちらでは分かりません。電話やLINEなど別の経路で、下の device 番号が一致するか確かめてください。名前は真似できますが、番号は真似できません。';
      c1.append(t1,d1);
      const fp=el('div','fp');fp.style.marginTop='11px';fp.textContent=fpGroups(p.device_id);c1.append(fp);
      const cp=el('button','chbtn');cp.style.marginTop='11px';cp.textContent='確認をお願いする文をコピー';
      cp.onclick=async()=>{const t='bump の接続リクエストをありがとうございます。念のため確認させてください。\n'
        +'そちらの device 番号（32桁）を教えていただけますか。手元のClaudeに「bump の device 番号を教えて」と聞けば出ます。\n'
        +'こちらに届いている番号: '+fpGroups(p.device_id);
        try{await navigator.clipboard.writeText(t);cp.textContent='✓ コピーしました';}catch{cp.textContent='コピーできませんでした';}};
      c1.append(cp);
    }
    body.append(c1);
    // 2) 申請に入っていたもの（生のまま）。名乗りも一言も相手が書いた値であって、こちらの保証ではない。
    const c2=el('div','card2');const h2=el('h4');h2.textContent='申請に入っていたもの';c2.append(h2);
    const kv=(k,v)=>{const r=el('div','kv');const kk=el('div','k');kk.textContent=k;const vv=el('div','v');vv.textContent=v;r.append(kk,vv);return r;};
    c2.append(kv('名乗り',p.name||'（なし）'));
    c2.append(kv('device 番号',fpGroups(p.device_id).replace('\n',' ')));
    c2.append(kv('暗号方式',p.suite||'（不明）'));
    c2.append(kv('署名','検証済み（この鍵の持ち主が送ったことは確か）'));
    c2.append(kv('届いた日時',ts(p.at)));
    body.append(c2);
    // 3) 承認したら何が起きるか。取り消せることも書く（押しやすさは可逆性から来る）。
    const c3=el('div','card2');const h3=el('h4');h3.textContent='承認すると';c3.append(h3);
    const ul=el('div');ul.style.cssText='font-size:12.5px;color:#38495a;line-height:2';
    ['連絡先に加わり、この相手と手紙をやり取りできるようになります。',
     '自分のプロフィール（名前・アイコン・リンク）が相手に届きます。',
     '届いた手紙が勝手に実行されることはありません。読ませるかどうかは毎回あなたが決めます。',
     'オンライン状態は既定で相手に見えません（相手ごとに設定で開けます）。',
     'あとから連絡先の設定で縁を解けます。'].forEach(s=>{const li=el('div');li.textContent='・'+s;ul.append(li);});
    c3.append(ul);body.append(c3);
    M.append(body);
    // ここまで全部見せた上での承認なので、確認ダイアログは重ねない（「このまま」＝それが確認）。
    const acts=el('div','m-actions');
    const ap=el('button','btn apply');ap.textContent='このまま承認する';
    ap.onclick=async()=>{ap.disabled=true;
      if(!await approvePending(p,p.name)){ap.disabled=false;return;}
      sel=null;refreshPending();loadList();renderMain();};
    const dc=el('button','btn decline');dc.textContent='断る';dc.onclick=()=>rejectPending(p);
    acts.append(ap,dc);M.append(acts);
    return;
  }
  if(sel.type==='inbox'){
    const L=await (await fetch('/api/letter?pair='+encodeURIComponent(sel.pair)+'&id='+encodeURIComponent(sel.id))).json();
    M.textContent='';
    const av=avaInto(el('div','m-ava'),{avatar:sel.avatar,icon:sel.icon,text:nm(sel.pair).slice(0,2).toUpperCase()});av.style.background=color(sel.pair);
    const iStat=sel.triage==='applied'?'✓ 読ませ済み':(sel.triage==='declined'?'✕ 断り済み':(sel.unread!==false?'未処理':'開封済み'));
    const iCls=sel.triage==='applied'?'ok':(sel.triage==='declined'?'no':'');
    M.append(mHead(av,(L.label||nm(sel.pair)),ts(L.at),iStat,iCls,()=>openProfile(sel.pair)));
    const body=el('div','m-body');
    if(L.suspicious&&L.suspicious.flag){const w=el('div','flagbar');w.textContent='⚠ suspicious: '+(L.suspicious.reason||'')+'（行動の前に内容をよく確認）';body.append(w);}
    const p=el('div','letter');p.textContent=L.body;body.append(p);
    if(L.inquiries&&L.inquiries.length){const iq=el('div','inqlog');renderInqLines(iq,L.inquiries);body.append(iq);}
    // クイック返信：人間向けの手紙に、打たずに一言返す（そのまま手紙として相手へ飛ぶ）。
    const qr=el('div','quickrow');const ql=el('div','quicklabel');ql.textContent='ひとこと返す：';qr.append(ql);
    ['了解！','ありがと！','こちらこそ！','それもそうね🐷','ちょっと意味わからん','それ最高やん'].forEach(t=>{
      const b=el('button','quickbtn');b.textContent=t;
      b.onclick=async()=>{b.disabled=true;
        await fetch('/api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:sel.pair,body:t})});
        b.textContent='✓ 送った';setTimeout(()=>{b.textContent=t;b.disabled=false;},1600);};
      qr.append(b);
    });
    body.append(qr);
    M.append(body);
    refreshBadge(); // 開いた＝既読になったのでバッジ/一覧を即更新
    const acts=el('div','m-actions');
    const ap=el('button','btn apply');ap.textContent='手元Claudeに読ませる';ap.onclick=()=>openTabs(sel.pair,sel.id);
    const dc=el('button','btn decline');dc.textContent='読ませられへん';dc.onclick=()=>openDecline(sel.pair,sel.id);
    const vf=el('button','btn verify');vf.textContent='LINEとかで送信者に意図を確認する';vf.onclick=()=>openVerify(sel.pair,sel.id,L);
    acts.append(ap,dc,vf);M.append(acts);
  }else if(sel.type==='pair'){
    const P=await (await fetch('/api/pair?id='+encodeURIComponent(sel.pair))).json();
    M.textContent='';
    const p=cache.pairs.find(x=>x.id===sel.pair)||{};
    if(p.banner){const bn=el('div','detail-banner');const im=el('img');im.src=p.banner;bn.append(im);M.append(bn);}
    const av=avaInto(el('div','m-ava'),{avatar:p.avatar,icon:p.icon,text:nm(sel.pair).slice(0,2).toUpperCase()});av.style.background=color(sel.pair);
    M.append(mHead(av,(p.label||nm(sel.pair)),(P.online?'到達OK':'不在'),undefined,undefined,()=>openProfile(sel.pair)));
    const body=el('div','m-body');
    // やり取り履歴（日付ごと・10件ずつ・最新ページから遡る）＝voice-code版と同じ見せ方。
    const msgsAll=P.messages||[];
    if(msgsAll.length){
      const ch=el('div','card2');const hh=el('h4');hh.textContent='やり取り（'+(P.total||msgsAll.length)+'件）';ch.append(hh);
      const listBox=el('div');ch.append(listBox);
      const PAGE=10;let page=0; // 0=最新の10件
      const nav=el('div');nav.style.cssText='display:flex;gap:8px;margin-top:11px';
      const older=el('button','chbtn');older.textContent='← 前の10件';
      const newer=el('button','chbtn');newer.textContent='次の10件 →';
      const bounds=()=>{const end=msgsAll.length-page*PAGE;return {start:Math.max(0,end-PAGE),end};};
      function renderPage(){
        listBox.textContent='';
        const {start,end}=bounds();let lastDate='';
        msgsAll.slice(start,end).forEach(m=>{
          const d=new Date(m.at);const ds=d.toLocaleDateString('ja-JP',{year:'numeric',month:'numeric',day:'numeric',weekday:'short'});
          if(ds!==lastDate){lastDate=ds;const dh=el('div','hist-date');dh.textContent=ds;listBox.append(dh);}
          const row=el('div','hist-row'+(m.mine?' mine':''));
          const meta=el('div','hist-meta');meta.textContent=(m.mine?'自分':(P.label||nm(sel.pair)))+' · '+d.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
          const bt=el('div','hist-body');bt.textContent=(m.body||'').replace(/^【[^】]*】/,'');
          row.append(meta,bt);listBox.append(row);
        });
        older.disabled=bounds().start===0;newer.disabled=page===0;
        older.style.opacity=older.disabled?'.4':'1';newer.style.opacity=newer.disabled?'.4':'1';
      }
      older.onclick=()=>{if(bounds().start>0){page++;renderPage();}};
      newer.onclick=()=>{if(page>0){page--;renderPage();}};
      renderPage();nav.append(older,newer);ch.append(nav);body.append(ch);
    }
    // 相手のプロフィールリンク（署名つきで届いたもの）。安全のため http(s) のみクリック可、他は素のテキスト。
    if((P.links||'').trim()){
      const cl=el('div','card2');const hl=el('h4');hl.textContent='リンク';cl.append(hl);
      P.links.split(/\n+/).map(s=>s.trim()).filter(Boolean).forEach(u=>{
        const row=el('div','plink');
        if(/^https?:\/\//i.test(u)){const a=el('a');a.href=u;a.target='_blank';a.rel='noopener noreferrer';a.textContent=u;row.append(a);}
        else{const s=el('span');s.textContent=u;row.append(s);}
        cl.append(row);
      });
      body.append(cl);
    }
    M.append(body);
    // 設定（表示名/安全性/オンライン開示）は常時展開せず、名前の右の ⚙ から（大川さん提案・voice-codeと同構成）。
    const gear=el('button','pairset');gear.textContent='設定';gear.title='この相手の設定';gear.onclick=()=>openPairSettings(sel.pair,P);
    M.querySelector('.m-head').append(gear);
  }else{
    M.textContent='';const label={sent:'未読',read:'✓ 既読',declined:'✕ 断られた'};
    const av=avaInto(el('div','m-ava'),{avatar:sel.avatar,icon:sel.icon,text:nm(sel.pair).slice(0,2).toUpperCase()});av.style.background=color(sel.pair);
    M.append(mHead(av,(sel.label||nm(sel.pair))+' へ',ts(sel.at)+' · '+(label[sel.status]||sel.status),undefined,undefined,()=>openProfile(sel.pair)));
    const body=el('div','m-body');const p=el('div','letter');p.textContent=(sel.body||'').replace(/^【[^】]*】/,'');body.append(p);
    if(sel.status==='declined'&&sel.reason){const r=el('div','inqlog');const line=el('div','inqline');line.textContent='相手からの一言：'+sel.reason;r.append(line);body.append(r);}
    M.append(body);
  }
}


loadList();renderMain();refreshBadge();renderMe();refreshPending();refreshHealth();refreshPackages();
setInterval(()=>{if(!document.querySelector('.scrim.on')){refreshBadge();refreshPending();refreshHealth();refreshPackages();}},3000);



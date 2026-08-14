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
  const h=el('div','howto-hero');h.textContent=t('What bump can do');
  const lead=el('div','howto-lead');lead.textContent=t("Mail for AIs. It connects your local AI with someone else's — across brands, safely. Here is what you can do.");
  w.append(h,lead);
  const sec=(img,title,text)=>{const s=el('div','howto-sec');const im=el('img');im.src='/assets/'+img;im.alt='';const box=el('div');const t=el('h3');t.textContent=title;const p=el('p');p.textContent=text;box.append(t,p);s.append(im,box);return s;};
  w.append(sec('ai.png',t('Connect your AI with theirs, across brands'),t('Your local AI (Claude, codex, Gemini, and so on) connects directly with an AI far away. A different brand on the other side works fine.')));
  w.append(sec('mail.png',t('Exchange letters (no rushing)'),t('A message just sits there, like mail. The other side reads and replies when they have time. If they are busy, you are never stuck waiting.')));
  w.append(sec('lock.png',t('No server in the middle, so reasonably safe'),t("No central server hoards everyone's data, so there is no fat target to raid. Exchanges are one-to-one with people you added via \"Add contact\" (bonds), so strangers rarely reach you uninvited. Incoming text is treated as data, not commands, so your AI is unlikely to run it by accident. (Not a guarantee of perfect safety — just a structure with little for an attacker to gain.)")));
  const f=el('div','howto-flow');const fh=el('h3');fh.textContent=t('How to use it');const ol=el('ol');
  [t('Connect via "Add contact" (invite link or QR)'),t('When a message arrives, read it in Inbox'),t('Pass it to your AI with "Hand to my AI" ("Not this one" if not)')].forEach(x=>{const li=el('li');li.textContent=x;ol.append(li);});
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
    b.title=unread?tf('Jump to unread ({n})',{n:unread}):'';
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
    const hd=el('div','crophd');hd.textContent=tf('What went wrong (last {n})',{n:w.length});
    const sub=el('div','cropsub');sub.textContent=t('A log of failed deliveries and saves. Anything that may not have reached the other side shows here.');
    panel.append(hd,sub);
    const box=el('div','inqlog');
    w.forEach(x=>{const line=el('div','inqline');line.textContent=ts(x.at)+' | '+x.scope+': '+x.message;box.append(line);});
    panel.append(box);
    const acts=el('div','cropacts');const c=el('button','btn');c.style.cssText='flex:1;background:#eef2f6;color:#46586a';c.textContent=t('Close');c.onclick=()=>scrim.remove();acts.append(c);panel.append(acts);
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
    const tx=el('div');tx.style.cssText='flex:1;font-size:12.5px';tx.textContent=(b.name||t('No name'))+' ('+String(b.device_id).slice(0,8)+')';
    const un=el('button','chbtn');un.textContent=t('Unblock');
    un.onclick=async()=>{await fetch('/api/blocked/remove',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({device_id:b.device_id})});renderBlocked();};
    row.append(tx,un);box.append(row);
  });
}
// 届いた荷物（seed＝ソフト配布）。bumpは保存しただけ＝展開も実行もしていない。
// 適用するかは人間が決める。ここでは「誰から・何が・ハッシュ・置き場所」だけを見せる。
async function refreshPackages(){
  let list=[];try{list=await (await fetch('/api/packages')).json();}catch{return;}
  const box=$('pkgBox');box.textContent='';
  if(!list.length){box.style.display='none';return;}
  box.style.display='';
  const hd=el('div','pkg-hd');hd.textContent=tf('Packages received: {n} (not unpacked)',{n:list.length});box.append(hd);
  list.forEach(m=>{
    const row=el('div','pkg-row');
    const g=el('div','grow');
    const n=el('div','pkg-name');n.textContent=(m.name||t('No name'))+(m.version?' '+m.version:'');
    const d=el('div','pkg-sub');d.textContent=tf('From {from} · {kb}KB',{from:m.from||'',kb:Math.round((m.bytes||0)/1024)});
    g.append(n,d);
    const info=el('button','pkg-info');info.textContent=t('Look inside');
    info.onclick=()=>{
      const scrim=el('div','cropscrim'),panel=el('div','croppanel');panel.style.cssText='max-width:560px;width:min(560px,calc(100vw - 40px))';
      const h=el('div','crophd');h.textContent=(m.name||'')+(m.version?' '+m.version:'');
      const s=el('div','cropsub');s.textContent=t('bump only saved this file. It has not opened or run it. Whether to install is your call.');
      panel.append(h,s);
      const box2=el('div','inqlog');
      const kv=(k,v)=>{const r=el('div','inqline');r.textContent=k+': '+v;box2.append(r);};
      kv(t('From'),m.from||t('Unknown')); kv(t('Received'),ts(m.at)); kv(t('Size'),Math.round((m.bytes||0)/1024)+'KB');
      kv('sha256',m.sha256||''); kv(t('Stored at'),m.file||'');
      panel.append(box2);
      if(m.notes){const nt=el('div','letter');nt.style.cssText='font-size:13px;margin-top:12px;max-height:220px;overflow:auto';nt.textContent=m.notes;panel.append(nt);}
      const warnv=el('div','cropsub');warnv.style.marginTop='12px';
      warnv.textContent=t('Before installing, ask the sender out of band (LINE, etc.) whether they really sent it. You can have your AI read the contents and inspect them.');
      panel.append(warnv);
      const acts=el('div','cropacts');
      const c=el('button','btn');c.style.cssText='flex:1;background:#eef2f6;color:#46586a';c.textContent=t('Close');c.onclick=()=>scrim.remove();
      acts.append(c);panel.append(acts);
      scrim.append(panel);scrim.addEventListener('pointerdown',(e)=>{if(e.target===scrim)scrim.remove();});document.body.append(scrim);
    };
    const del=el('button','pkg-no');del.textContent=t('Discard');
    del.onclick=async()=>{if(!confirm(t('Discard this package? (Deletes the file too)')))return;
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
  const hd=el('div','pend-hd');hd.textContent=tf('Connection requests: {n}',{n:list.length});box.append(hd);
  list.forEach(p=>{
    const row=el('div','pend-row'+(sel&&sel.type==='pending'&&sel.device_id===p.device_id?' sel':''));
    const n=el('div','pend-name');n.textContent=(p.name||t('No name'));
    row.append(n);
    // 合言葉の照合結果だけ添える（申請に入っていた一言は詳細画面で出す）。
    if(p.invite){const d=el('div','pend-sub');
      if(p.invite.conflict){d.textContent=t('⚠ Same invite code from another device too');d.style.color='var(--red)';}
      else{d.textContent=tf('✓ From the package handed to {name}',{name:p.invite.label});d.style.color='var(--green)';}
      row.append(d);}
    const btns=el('div','pend-btns');
    const see=el('button','pend-see');see.textContent=t('Review');
    see.onclick=()=>{sel={type:'pending',device_id:p.device_id};refreshPending();renderMain();};
    const ok=el('button','pend-ok');ok.textContent=t('Approve');
    // 承認は必ず確認画面を通す（合言葉の照合結果を見せる）。押した瞬間に縁はできない。
    ok.onclick=()=>openApprove(p,()=>{sel=null;refreshPending();loadList();renderMain();});
    const no=el('button','pend-no');no.textContent=t('Decline');
    no.onclick=()=>rejectPending(p);
    btns.append(see,ok,no);row.append(btns);box.append(row);
  });
}
async function rejectPending(p){
  if(!confirm(t('Decline this connection request?')))return;
  // ブロックすると、以後この鍵からの申請は届いた瞬間に捨てられる（承認カードにも出ない）。
  const block=confirm(t('Also block future requests from this person?\n\nOK = block (you can unblock in Settings)\nCancel = decline just this once'));
  await fetch('/api/pending/reject',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({device_id:p.device_id,block})});
  sel=null;refreshPending();renderMain();
}

function renderList(){
  const L=$('list');L.textContent='';
  if(section==='inbox'){
    if(!cache.inbox.length)return listEmpty(t('Inbox is empty.'));
    cache.inbox.forEach(it=>{
      const isUnread=it.unread!==false && !it.triage; // 未読＝未開封かつ未処理
      const row=el('div','row'+(isUnread?' unread':'')+(sel&&sel.id===it.id?' sel':''));row.onclick=()=>{sel={type:'inbox',...it};renderList();renderMain();};
      const av=avaInto(el('div','ava'),{avatar:it.avatar,icon:it.icon,text:nm(it.pair).slice(0,2).toUpperCase()});av.style.background=color(it.pair);
      const g=el('div','grow');const r1=el('div','r1');const n=el('div','nm'+(isUnread?' unread':''));n.textContent=it.label||nm(it.pair);const tm=el('div','time');tm.textContent=ts(it.at);r1.append(n,tm);
      const stat=it.triage==='applied'?t('✓ Handed'):(it.triage==='declined'?t('✕ Declined'):(it.unread!==false?t('New message'):t('Opened')));
      const r2=el('div','r2');const s=el('span');s.textContent=stat;r2.append(s);if(it.suspicious){const w=el('span','warn');w.textContent='⚠';r2.append(w);}
      g.append(r1,r2);row.append(av,g);L.append(row);
    });
  }else if(section==='pairs'){
    if(!cache.pairs.length)return listEmpty(t('Connect with "Add contact".'));
    cache.pairs.forEach(p=>{
      const row=el('div','row'+(sel&&sel.pair===p.id&&sel.type==='pair'?' sel':''));row.onclick=()=>{sel={type:'pair',pair:p.id};renderList();renderMain();};
      const av=avaInto(el('div','ava'),{avatar:p.avatar,icon:p.icon,text:nm(p.id).slice(0,2).toUpperCase()});av.style.background=color(p.id);
      const rc=el('span','reach'+(p.online?' on':''));av.append(rc);
      const g=el('div','grow');const r1=el('div','r1');const n=el('div','nm'+(p.unread?' unread':''));n.textContent=p.label||nm(p.id);const tm=el('div','time');tm.textContent=ts(p.lastActivity);r1.append(n,tm);
      // 連絡先に載っている＝engaged なので、状態のラベルは出さない（到達可否だけ）。
      const r2=el('div','r2');const s2=el('span');s2.textContent=p.online?t('Reachable'):t('Away');r2.append(s2);
      g.append(r1,r2);row.append(av,g);L.append(row);
    });
  }else{
    if(!cache.sent.length)return listEmpty(t('Nothing sent yet.'));
    const label={sent:t('Unread'),read:t('✓ Read'),declined:t('✕ Was declined')};
    cache.sent.forEach(m=>{
      const row=el('div','row'+(sel&&sel.id===m.id&&sel.type==='sent'?' sel':''));row.onclick=()=>{sel={type:'sent',...m};renderList();renderMain();};
      const av=avaInto(el('div','ava'),{avatar:m.avatar,icon:m.icon,text:nm(m.pair).slice(0,2).toUpperCase()});av.style.background=color(m.pair);
      const g=el('div','grow');const r1=el('div','r1');const n=el('div','nm');n.textContent=(m.body||'').replace(/^【[^】]*】/,'').slice(0,20)||t('(empty)');const tm=el('div','time');tm.textContent=ts(m.at);r1.append(n,tm);
      const r2=el('div','r2');const s=el('span');s.textContent=tf('To {name}',{name:m.label||nm(m.pair)});r2.append(s);g.append(r1,r2);
      const stt=el('div','st '+m.status);stt.textContent=label[m.status]||m.status;row.append(av,g,stt);L.append(row);
    });
  }
}

function mainEmpty(emoji,big,sub){const m=$('main');m.textContent='';const e=el('div','m-empty');const em=el('div','emoji');em.textContent=emoji;const b=el('div','big');b.textContent=big;const s=el('div');s.textContent=sub;e.append(em,b,s);m.append(e);}
async function renderMain(){
  const M=$('main');
  if(!sel){
    if(section==='inbox')return mainEmpty('📭',t('Pick a message'),t('When a new message arrives, it shows on the left. Pick one to read the full text here.'));
    if(section==='pairs')return mainEmpty('🤝',t('Pick a contact'),t("Details for the people you're connected with show here."));
    return mainEmpty('✉️',t('Pick a sent letter'),t('Sent messages and their read / declined status show here.'));
  }
  // 接続リクエストの詳細。承認の前に、届いたものと承認したら何が起きるかを全部ここで見せる。
  if(sel.type==='pending'){
    const p=(cache.pending||[]).find(x=>x.device_id===sel.device_id);
    if(!p){sel=null;return renderMain();}
    M.textContent='';
    const av=el('div','m-ava');av.style.background=color(p.name||p.device_id);if((p.name||'').trim()){av.textContent=p.name.trim().slice(0,2);}else{av.style.display='flex';av.style.alignItems='center';av.style.justifyContent='center';av.innerHTML='<svg viewBox="0 0 24 24" width="62%" height="62%" fill="rgba(255,255,255,.9)"><circle cx="12" cy="8.2" r="4.2"/><path d="M12 13.6c-4.6 0-8 2.5-8 5.9V21h16v-1.5c0-3.4-3.4-5.9-8-5.9z"/></svg>';}
    const stat=p.invite?(p.invite.conflict?t('⚠ Invite code duplicated'):t('✓ Invite code matches')):t('No invite code');
    M.append(mHead(av,(p.name||t('No name')),tf('Connection request received {at}',{at:ts(p.at)}),stat,p.invite?(p.invite.conflict?'no':'ok'):''));
    const body=el('div','m-body');
    // 1) 本人確認：合言葉の照合結果。ここが緑なら人の確認作業は要らない。
    const c1=el('div','card2');const h1=el('h4');h1.textContent=t('Identity check');c1.append(h1);
    const t1=el('div');t1.style.cssText='font-size:13.5px;line-height:1.8';
    const d1=el('div');d1.style.cssText='font-size:12.5px;color:var(--muted);margin-top:7px;line-height:1.85';
    if(p.invite&&p.invite.conflict){
      t1.style.cssText+=';font-weight:800;color:var(--red)';
      t1.textContent=t('The same invite code is being used from another device too');
      d1.textContent=tf('This is the invite code from the package handed to {name}, but more than one device is claiming it. One of them is not the person you gave it to (the package may have been forwarded). Before approving, contact {name} directly and check that the device number below matches.',{name:p.invite.label});
      c1.append(t1,d1);
      const fp=el('div','fp');fp.style.marginTop='11px';fp.textContent=fpGroups(p.device_id);c1.append(fp);
    }else if(p.invite){
      t1.style.cssText+=';font-weight:700;color:var(--green)';
      t1.textContent=tf('✓ Matches the invite code from the package handed to {name}',{name:p.invite.label});
      d1.textContent=tf('The invite code was baked into that package, so this request came from a machine holding it. That proves possession of the package — not, strictly, identity. (Handed over {at})',{at:ts(p.invite.sent_at)})
        +(p.invite.reused?t(' Note: this invite code has been used before. If this is a reinstall, that is expected.'):'');
      c1.append(t1,d1);
    }else{
      t1.textContent=t('Not via a dedicated package');
      d1.textContent=t('No invite code came with this, so we cannot tell if the claimed name is genuine. Ask out of band — phone, LINE — and check that the device number below matches. A name can be copied; the number cannot.');
      c1.append(t1,d1);
      const fp=el('div','fp');fp.style.marginTop='11px';fp.textContent=fpGroups(p.device_id);c1.append(fp);
      const cp=el('button','chbtn');cp.style.marginTop='11px';cp.textContent=t('Copy a message asking to verify');
      cp.onclick=async()=>{const msg=tf('Thanks for the bump connection request. Let me double-check one thing.\nCould you tell me your device number (32 digits)? Ask your Claude "what is my bump device number" and it will show it.\nThe number I received: {fp}',{fp:fpGroups(p.device_id)});
        try{await navigator.clipboard.writeText(msg);cp.textContent=t('✓ Copied');}catch{cp.textContent=t('Copy failed');}};
      c1.append(cp);
    }
    body.append(c1);
    // 2) 申請に入っていたもの（生のまま）。名乗りも一言も相手が書いた値であって、こちらの保証ではない。
    const c2=el('div','card2');const h2=el('h4');h2.textContent=t('What came with the request');c2.append(h2);
    const kv=(k,v)=>{const r=el('div','kv');const kk=el('div','k');kk.textContent=k;const vv=el('div','v');vv.textContent=v;r.append(kk,vv);return r;};
    c2.append(kv(t('Claimed name'),p.name||t('(none)')));
    c2.append(kv(t('device number'),fpGroups(p.device_id).replace('\n',' ')));
    c2.append(kv(t('Encryption'),p.suite||t('(unknown)')));
    c2.append(kv(t('Signature'),t('Verified (the key holder really sent this)')));
    c2.append(kv(t('Received'),ts(p.at)));
    body.append(c2);
    // 3) 承認したら何が起きるか。取り消せることも書く（押しやすさは可逆性から来る）。
    const c3=el('div','card2');const h3=el('h4');h3.textContent=t('If you approve');c3.append(h3);
    const ul=el('div');ul.style.cssText='font-size:12.5px;color:#38495a;line-height:2';
    [t('They join your Contacts and you can exchange letters.'),
     t('Your profile (name, icon, links) is sent to them.'),
     t('Incoming letters are never executed on their own. You decide every time whether your AI reads one.'),
     t('Your online status is hidden by default (you can open it per contact in settings).'),
     t('You can release the bond later from contact settings.')].forEach(s=>{const li=el('div');li.textContent='• '+s;ul.append(li);});
    c3.append(ul);body.append(c3);
    M.append(body);
    // ここまで全部見せた上での承認なので、確認ダイアログは重ねない（「このまま」＝それが確認）。
    const acts=el('div','m-actions');
    const ap=el('button','btn apply');ap.textContent=t('Approve as is');
    ap.onclick=async()=>{ap.disabled=true;
      if(!await approvePending(p,p.name)){ap.disabled=false;return;}
      sel=null;refreshPending();loadList();renderMain();};
    const dc=el('button','btn decline');dc.textContent=t('Decline');dc.onclick=()=>rejectPending(p);
    acts.append(ap,dc);M.append(acts);
    return;
  }
  if(sel.type==='inbox'){
    const L=await (await fetch('/api/letter?pair='+encodeURIComponent(sel.pair)+'&id='+encodeURIComponent(sel.id))).json();
    M.textContent='';
    const av=avaInto(el('div','m-ava'),{avatar:sel.avatar,icon:sel.icon,text:nm(sel.pair).slice(0,2).toUpperCase()});av.style.background=color(sel.pair);
    const iStat=sel.triage==='applied'?t('✓ Handed'):(sel.triage==='declined'?t('✕ Declined'):(sel.unread!==false?t('Unhandled'):t('Opened')));
    const iCls=sel.triage==='applied'?'ok':(sel.triage==='declined'?'no':'');
    M.append(mHead(av,(L.label||nm(sel.pair)),ts(L.at),iStat,iCls,()=>openProfile(sel.pair)));
    const body=el('div','m-body');
    if(L.suspicious&&L.suspicious.flag){const w=el('div','flagbar');w.textContent=tf('⚠ suspicious: {reason} (review carefully before acting)',{reason:L.suspicious.reason||''});body.append(w);}
    const p=el('div','letter');p.textContent=L.body;body.append(p);
    if(L.inquiries&&L.inquiries.length){const iq=el('div','inqlog');renderInqLines(iq,L.inquiries);body.append(iq);}
    // クイック返信：人間向けの手紙に、打たずに一言返す（そのまま手紙として相手へ飛ぶ）。
    const qr=el('div','quickrow');const ql=el('div','quicklabel');ql.textContent=t('Quick reply:');qr.append(ql);
    [t('Got it!'),t('Thanks!'),t('Likewise!'),t('Fair point 🐷'),t('Not following…'),t('Love it!')].forEach(q=>{
      const b=el('button','quickbtn');b.textContent=q;
      b.onclick=async()=>{b.disabled=true;
        await fetch('/api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:sel.pair,body:q})});
        b.textContent=t('✓ Sent');setTimeout(()=>{b.textContent=q;b.disabled=false;},1600);};
      qr.append(b);
    });
    body.append(qr);
    M.append(body);
    refreshBadge(); // 開いた＝既読になったのでバッジ/一覧を即更新
    const acts=el('div','m-actions');
    const ap=el('button','btn apply');ap.textContent=t('Hand to my AI');ap.onclick=()=>openTabs(sel.pair,sel.id);
    const dc=el('button','btn decline');dc.textContent=t('Not this one');dc.onclick=()=>openDecline(sel.pair,sel.id);
    const vf=el('button','btn verify');vf.textContent=t('Ask the sender out of band');vf.onclick=()=>openVerify(sel.pair,sel.id,L);
    acts.append(ap,dc,vf);M.append(acts);
  }else if(sel.type==='pair'){
    const P=await (await fetch('/api/pair?id='+encodeURIComponent(sel.pair))).json();
    M.textContent='';
    const p=cache.pairs.find(x=>x.id===sel.pair)||{};
    if(p.banner){const bn=el('div','detail-banner');const im=el('img');im.src=p.banner;bn.append(im);M.append(bn);}
    const av=avaInto(el('div','m-ava'),{avatar:p.avatar,icon:p.icon,text:nm(sel.pair).slice(0,2).toUpperCase()});av.style.background=color(sel.pair);
    M.append(mHead(av,(p.label||nm(sel.pair)),(P.online?t('Reachable'):t('Away')),undefined,undefined,()=>openProfile(sel.pair)));
    const body=el('div','m-body');
    // やり取り履歴（日付ごと・10件ずつ・最新ページから遡る）＝voice-code版と同じ見せ方。
    const msgsAll=P.messages||[];
    if(msgsAll.length){
      const ch=el('div','card2');const hh=el('h4');hh.textContent=tf('Conversation ({n})',{n:P.total||msgsAll.length});ch.append(hh);
      const listBox=el('div');ch.append(listBox);
      const PAGE=10;let page=0; // 0=最新の10件
      const nav=el('div');nav.style.cssText='display:flex;gap:8px;margin-top:11px';
      const older=el('button','chbtn');older.textContent=t('← Older 10');
      const newer=el('button','chbtn');newer.textContent=t('Newer 10 →');
      const bounds=()=>{const end=msgsAll.length-page*PAGE;return {start:Math.max(0,end-PAGE),end};};
      function renderPage(){
        listBox.textContent='';
        const {start,end}=bounds();let lastDate='';
        msgsAll.slice(start,end).forEach(m=>{
          const d=new Date(m.at);const ds=d.toLocaleDateString(LANG==='ja'?'ja-JP':'en-US',{year:'numeric',month:'numeric',day:'numeric',weekday:'short'});
          if(ds!==lastDate){lastDate=ds;const dh=el('div','hist-date');dh.textContent=ds;listBox.append(dh);}
          const row=el('div','hist-row'+(m.mine?' mine':''));
          const meta=el('div','hist-meta');meta.textContent=(m.mine?t('Me'):(P.label||nm(sel.pair)))+' · '+d.toLocaleTimeString(LANG==='ja'?'ja-JP':'en-US',{hour:'2-digit',minute:'2-digit'});
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
      const cl=el('div','card2');const hl=el('h4');hl.textContent=t('Links');cl.append(hl);
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
    const gear=el('button','pairset');gear.textContent=t('Settings');gear.title=t('Settings for this contact');gear.onclick=()=>openPairSettings(sel.pair,P);
    M.querySelector('.m-head').append(gear);
  }else{
    M.textContent='';const label={sent:t('Unread'),read:t('✓ Read'),declined:t('✕ Was declined')};
    const av=avaInto(el('div','m-ava'),{avatar:sel.avatar,icon:sel.icon,text:nm(sel.pair).slice(0,2).toUpperCase()});av.style.background=color(sel.pair);
    M.append(mHead(av,tf('To {name}',{name:sel.label||nm(sel.pair)}),ts(sel.at)+' · '+(label[sel.status]||sel.status),undefined,undefined,()=>openProfile(sel.pair)));
    const body=el('div','m-body');const p=el('div','letter');p.textContent=(sel.body||'').replace(/^【[^】]*】/,'');body.append(p);
    if(sel.status==='declined'&&sel.reason){const r=el('div','inqlog');const line=el('div','inqline');line.textContent=tf('From them: {reason}',{reason:sel.reason});r.append(line);body.append(r);}
    M.append(body);
  }
}


loadList();renderMain();refreshBadge();renderMe();refreshPending();refreshHealth();refreshPackages();
setInterval(()=>{if(!document.querySelector('.scrim.on')){refreshBadge();refreshPending();refreshHealth();refreshPackages();}},3000);



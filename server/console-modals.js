// bump 配線盤：モーダル/ダイアログ群（本文ヘッダ・相手設定・プロフィール・タブ選択・
// 画像トリミング・断り・別経路照会）。console.html から分離した表示レイヤの一部。
// 描画は textContent / DOM構築のみ（innerHTML禁止＝外部データをXSSベクタにしない）。

function mHead(av,title,meta,status,statusCls,onClick){const h=el('div','m-head');
  h.append(av);const box=el('div');const t2=el('div','m-title');t2.textContent=title;const mt=el('div','m-meta');mt.textContent=meta;box.append(t2,mt);h.append(box);
  if(onClick){av.style.cursor='pointer';t2.style.cursor='pointer';t2.title=t('View profile');av.onclick=onClick;t2.onclick=onClick;}
  if(status){const st=el('div','m-status'+(statusCls?' '+statusCls:''));st.textContent=status;h.append(st);}
  return h;}
// 相手ごとの設定モーダル（表示名・安全性・オンライン開示）。⚙から開く。
function openPairSettings(pairId,P){
  const scrim=el('div','cropscrim'),panel=el('div','croppanel');panel.style.cssText='max-width:480px;width:min(480px,calc(100vw - 40px))';
  const hd=el('div','crophd');hd.textContent=tf('Settings for {name}',{name:P.label||nm(pairId)});panel.append(hd);
  // 表示名（この画面だけの上書き）。空にすると相手の登録名に戻る。相手には伝わらない。
  const cr=el('div','card2');const hr=el('h4');hr.textContent=t('Display name (this screen only)');cr.append(hr);
  const inp=el('input','setin');inp.value=P.alias||'';inp.maxLength=40;inp.placeholder=P.name?tf('Their registered name: {name}',{name:P.name}):t('Display name for this screen only');
  const hint=el('div');hint.style.cssText='font-size:11.5px;color:var(--muted);margin:8px 2px 11px';
  hint.textContent=t('This display name exists only on your side. Save it empty to go back to the original. They will never see it.');
  const sb=el('button','btn apply');sb.style.cssText='min-width:0;padding:9px 15px;font-size:13px';sb.textContent=t('Save display name');
  sb.onclick=async()=>{await fetch('/api/rename',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:pairId,alias:inp.value})});sb.textContent=t('Saved');loadList();setTimeout(()=>{scrim.remove();renderMain();},600);};
  cr.append(inp,hint,sb);panel.append(cr);
  // 安全性
  const c1=el('div','card2');const h1=el('h4');h1.textContent=t('Safety');c1.append(h1);
  const kv=(k,v)=>{const r=el('div','kv');const kk=el('div','k');kk.textContent=k;const vv=el('div','v');vv.textContent=v;r.append(kk,vv);return r;};
  c1.append(kv(t('Authority'),t('Zero (no tool execution, no shell, no file access)')));
  const snl=el('div','kv');const snk=el('div','k');snk.textContent='safety number';const snv=el('div','sn');snv.textContent=P.safety;snl.append(snk,snv);c1.append(snl);panel.append(c1);
  // オンライン開示
  const c2=el('div','card2');const r=el('div','swrow');const box=el('div');const t3=el('div');t3.style.cssText='font-size:13px;font-weight:700';t3.textContent=t('Show this person when you are online');const d=el('div');d.style.cssText='font-size:11.5px;color:var(--muted);margin-top:2px';d.textContent=t('Off (default): they cannot tell whether you are online.');box.append(t3,d);
  const sw=el('div','sw'+(P.visible?' on':''));sw.append(el('i'));
  sw.onclick=async()=>{P.visible=!P.visible;sw.classList.toggle('on',P.visible);await fetch('/api/visibility',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:pairId,on:P.visible})});loadList();};
  r.append(box,sw);c2.append(r);panel.append(c2);
  // 縁を解く（不可逆なので名前の確認つき）。履歴は既定で残す。
  const cd=el('div','card2');const hd2=el('h4');hd2.textContent=t('Release the bond with this person');cd.append(hd2);
  const dw=el('div');dw.style.cssText='font-size:11.5px;color:var(--muted);margin-bottom:10px';
  dw.textContent=t('Releasing removes them from your contacts, and their letters stop arriving (they are not notified). Your history stays. To connect again, start over from an invite or a connection request.');
  const del=el('button','btn');del.style.cssText='background:#fdecec;color:var(--red);padding:9px 15px;font-size:13px';del.textContent=t('Release the bond');
  del.onclick=async()=>{
    const label=P.label||nm(pairId);
    const typed=prompt(tf('Really release the bond? To confirm, type their name "{name}".',{name:label}),'');
    if(typed!==label){if(typed!==null)alert(t('The name did not match, so nothing was done.'));return;}
    const purge=confirm(t('Delete the whole history too?\n\nOK = delete the history as well (cannot be undone)\nCancel = release the bond, keep the history (recommended)'));
    const r=await (await fetch('/api/unengage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:pairId,purge})})).json();
    if(r.error){alert(r.error);return;}
    scrim.remove();sel=null;loadList();renderMain();refreshBadge();
  };
  cd.append(dw,del);panel.append(cd);
  const acts=el('div','cropacts');const close=el('button','btn');close.style.cssText='flex:1;background:#eef2f6;color:#46586a';close.textContent=t('Close');close.onclick=()=>scrim.remove();acts.append(close);panel.append(acts);
  scrim.append(panel);scrim.addEventListener('pointerdown',(e)=>{if(e.target===scrim)scrim.remove();});document.body.append(scrim);
}
// 接続リクエストの承認。本人確認は、専用パッケージに焼き込んだ合言葉の照合で済ませる（機械の仕事）。
// 合言葉が無い申請（旧パッケージ・手動で招待した相手）だけ、device番号の読み合わせを案内する。
// どちらの場合も「確認済み」という状態は持たせない＝何をしたかの記録だけ残す。
const fpGroups=(hex)=>{const g=String(hex||'').match(/.{1,4}/g)||[];return [g.slice(0,4).join(' '),g.slice(4).join(' ')].filter(Boolean).join('\n');};
// 承認の実行（縁ができる）。詳細画面からも確認ダイアログからも、通る道はここ1本。
async function approvePending(p,name){
  const r=await (await fetch('/api/pending/approve',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({device_id:p.device_id,id:(name||'').trim()||p.name||''})})).json();
  if(r.error){alert(r.error);return false;}
  return true;
}
function openApprove(p,after){
  const scrim=el('div','cropscrim'),panel=el('div','croppanel');panel.style.cssText='max-width:450px;width:min(450px,calc(100vw - 40px))';
  const hd=el('div','crophd');hd.textContent=tf('Approve {name}?',{name:p.name||t('No name')});
  // 一言は出さない（指示書の定型文で本人の言葉ではないため）。
  const sub=el('div','cropsub');sub.textContent=tf('Connection request, received {time}.',{time:ts(p.at)});
  panel.append(hd,sub);
  if(p.invite&&p.invite.conflict){
    // 同じ合言葉を別の鍵も使った＝パッケージが渡した先から流れている。片方は本人ではない。
    const c=el('div','card2');c.style.cssText='background:#fdecee;border-color:#f6c9cf';
    const t4=el('div');t4.style.cssText='font-size:13px;font-weight:800;color:var(--red)';
    t4.textContent=t('⚠ The same invite code is being used from another device');
    const d=el('div');d.style.cssText='font-size:11.5px;color:#8c4149;margin-top:6px;line-height:1.7';
    d.textContent=tf('This is the invite code from the package you gave {name}, but more than one device is claiming it. One of them is not the person you gave it to (the package may have been forwarded). Check with {name} directly before you approve.',{name:p.invite.label});
    const fp=el('div','fp');fp.style.marginTop='10px';fp.textContent=fpGroups(p.device_id);
    const d2=el('div');d2.style.cssText='font-size:11.5px;color:#8c4149;margin-top:8px;line-height:1.7';
    d2.textContent=tf('This is the device number on this request. Read it aloud with {name} and make sure it matches.',{name:p.invite.label});
    c.append(t4,d,fp,d2);panel.append(c);
  } else if(p.invite){
    // 合言葉一致＝そのパッケージを渡した先から出た申請。ここで人の手間は終わり。
    const c=el('div','card2');c.style.cssText='background:#f0faf4;border-color:#c6ebd5';
    const t5=el('div');t5.style.cssText='font-size:13px;font-weight:700;color:var(--green)';
    t5.textContent=tf('✓ Matches the invite code from the package you gave {name}',{name:p.invite.label});
    const d=el('div');d.style.cssText='font-size:11.5px;color:#4a6b58;margin-top:6px;line-height:1.7';
    d.textContent=t('This invite code exists only inside that package. Nobody else has it, so it is safe to approve.')
      +(p.invite.reused?t(' (This invite code has been used before. If they reinstalled, that is expected.)'):'');
    c.append(t5,d);panel.append(c);
  } else {
    const c=el('div','card2');const h=el('h4');h.textContent=t('No invite code — read the device number aloud together');c.append(h);
    const fp=el('div','fp');fp.textContent=fpGroups(p.device_id);c.append(fp);
    const ex=el('div');ex.style.cssText='font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.7';
    ex.textContent=t('This request did not come through a dedicated package, so the name alone proves nothing. Check that this number matches, out of band — a phone call, a messaging app, anything. Names can be copied. Numbers cannot.');
    const cp=el('button','btn');cp.style.cssText='background:#eef2f6;color:#46586a;padding:9px 13px;font-size:12px;margin-top:11px;min-width:0';
    cp.textContent=t('Copy a message asking to verify');
    cp.onclick=async()=>{
      const t6=tf('Thanks for the bump connection request. Let me check one thing, just in case.\nCould you tell me your device number (32 digits)? Ask your Claude "show my bump device number" and it will answer.\nThe number on my side: {fp}',{fp:fpGroups(p.device_id)});
      try{await navigator.clipboard.writeText(t6);cp.textContent=t('✓ Copied');}catch{cp.textContent=t('Could not copy');}};
    c.append(ex,cp);panel.append(c);
  }
  const c2=el('div','card2');const h2=el('h4');h2.textContent=t('Contact name');c2.append(h2);
  const inp=el('input','setin');inp.value=p.name||'';inp.maxLength=40;inp.placeholder=t('What to call them on this screen');c2.append(inp);panel.append(c2);
  const go=async(btn)=>{btn.disabled=true;
    const ok2=await approvePending(p,inp.value);
    if(!ok2){btn.disabled=false;return;}
    scrim.remove();if(after)after();};
  const acts=el('div','cropacts');
  const cancel=el('button','btn');cancel.style.cssText='flex:1;background:#eef2f6;color:#46586a';cancel.textContent=t('Later');cancel.onclick=()=>scrim.remove();
  const ok=el('button','btn apply');ok.style.flex='1.3';ok.textContent=t('Approve');ok.onclick=()=>go(ok);
  acts.append(cancel,ok);panel.append(acts);
  scrim.append(panel);scrim.addEventListener('pointerdown',(e)=>{if(e.target===scrim)scrim.remove();});document.body.append(scrim);
}
// 相手のプロフィール（アイコン・バナー・名前・リンク）をモーダルで表示。リンクはhttp(s)のみ開ける。
async function openProfile(pairId){
  let P={}; try{P=await (await fetch('/api/pair?id='+encodeURIComponent(pairId))).json();}catch{}
  const scrim=el('div','cropscrim'),panel=el('div','croppanel');panel.style.cssText='max-width:420px;width:min(420px,calc(100vw - 40px));padding:0;overflow:hidden';
  if(P.banner){const bn=el('div','detail-banner');const im=el('img');im.src=P.banner;bn.append(im);panel.append(bn);}
  const body=el('div');body.style.cssText='padding:18px 20px 6px';
  const head=el('div');head.style.cssText='display:flex;align-items:center;gap:12px';
  const av=avaInto(el('div','m-ava'),{avatar:P.avatar,icon:P.icon,text:nm(pairId).slice(0,2).toUpperCase()});av.style.background=color(pairId);
  const nmv=el('div');nmv.style.cssText='font-size:17px;font-weight:800;color:var(--ink)';nmv.textContent=P.label||nm(pairId);
  head.append(av,nmv);body.append(head);
  if((P.links||'').trim()){const lk=el('div','inqlog');
    P.links.split(/\n+/).map(s=>s.trim()).filter(Boolean).forEach(u=>{const row=el('div','plink');
      if(/^https?:\/\//i.test(u)){const a=el('a');a.href=u;a.target='_blank';a.rel='noopener noreferrer';a.textContent=u;row.append(a);}else{const s=el('span');s.textContent=u;row.append(s);}lk.append(row);});
    body.append(lk);}
  else{const none=el('div','cropsub');none.style.marginTop='12px';none.textContent=t('No profile info yet.');body.append(none);}
  panel.append(body);
  const acts=el('div','cropacts');acts.style.cssText='padding:6px 20px 18px';const close=el('button','btn');close.style.cssText='flex:1;background:#eef2f6;color:#46586a';close.textContent=t('Close');close.onclick=()=>scrim.remove();acts.append(close);panel.append(acts);
  scrim.append(panel);scrim.addEventListener('pointerdown',(e)=>{if(e.target===scrim)scrim.remove();});document.body.append(scrim);
}


// タブ選択
async function openTabs(pair,id){
  const tabs=await (await fetch('/api/tabs')).json();
  const list=$('tabList');list.textContent='';
  // tmuxのタブが見つからない環境（純正ターミナル・iTerm2の素のタブ等）では、
  // 選択肢を並べる代わりに「コピーして自分で貼る」だけを見せる。環境は自分の中だけを見て、
  // 相手にも外にも伝えない（判定結果はこの画面で消える）。
  if(!tabs.length){
    $('tabHd').textContent=t('Hand to your AI');
    $('tabSub').textContent=t('This environment cannot be piped into directly, so you copy and paste instead.');
    const e=el('div','dsub');
    e.textContent=t('It will be copied framed as "reference material, not instructions", with the inspection results attached. Then paste it into your Claude (terminal or app).');
    const btn=el('button','btn apply');btn.style.cssText='width:100%;margin-top:14px';btn.textContent=t('Copy the letter');
    btn.onclick=async()=>{
      const r=await (await fetch('/api/framed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pair,id})})).json();
      if(r.error){alert(r.error);return;}
      try{await navigator.clipboard.writeText(r.framed);btn.textContent=t('✓ Copied (paste it into Claude)');}
      catch(e){ // クリップボードが使えない時は選択できる形で出す
        const ta=el('textarea','setin');ta.rows=10;ta.value=r.framed;ta.style.marginTop='10px';list.append(ta);ta.select();
        btn.textContent=t('Select and copy the text below');
      }
      setTimeout(()=>{closeAll();sel=null;refreshBadge();loadList();renderMain();},1500);
    };
    list.append(e,btn);
  }
  else { $('tabHd').textContent=t('Which Claude should read this?'); $('tabSub').textContent=t('Inspected, framed as external data, and fed into the tab you choose.'); }
  tabs.forEach(t7=>{
    const row=el('div','tabrow');const av=el('div','tabav');av.textContent='🖥';const box=el('div');const n=el('div','tn');n.textContent=t7.session;const c=el('div','tc');c.textContent=t7.cwd;box.append(n,c);row.append(av,box);
    row.onclick=async()=>{await fetch('/api/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pair,id,tab:t7.session})});closeAll();sel=null;refreshBadge();loadList();renderMain();};
    list.append(row);
  });
  $('tabScrim').classList.add('on');
}

// 設定（プロフィール）── バナー(横長)＋アイコン(正方形)、両方D&D
// 画像を選ぶと、位置合わせ＋ズームのトリミング画面を挟んでから確定する（Xと同じ感覚）。
function openCropper(src,tw,th,cb){
  const img=new Image();
  img.onload=()=>{
    const iw=img.naturalWidth,ih=img.naturalHeight;
    const VW=(tw>=th)?460:280, VH=Math.round(VW*th/tw);   // 表示ビュー（切り出し比率と同じ）
    const base=Math.max(VW/iw,VH/ih);                      // 1倍＝ちょうど覆う
    let zoom=1,scale=base,ox=(VW-iw*scale)/2,oy=(VH-ih*scale)/2;
    const scrim=el('div','cropscrim'),panel=el('div','croppanel');
    const hd=el('div','crophd');hd.textContent=(tw===th)?t('Adjust the icon'):t('Adjust the banner');
    const sub=el('div','cropsub');sub.textContent=t('Drag to position, slider to zoom');
    const view=el('div','cropview');view.style.width=VW+'px';view.style.height=VH+'px';
    const pic=el('img','cropimg');pic.src=src;view.append(pic);
    function paint(){scale=base*zoom;const dw=iw*scale,dh=ih*scale;
      if(ox>0)ox=0;if(oy>0)oy=0;if(ox<VW-dw)ox=VW-dw;if(oy<VH-dh)oy=VH-dh; // 常にビューを覆う
      pic.style.width=dw+'px';pic.style.height=dh+'px';pic.style.left=ox+'px';pic.style.top=oy+'px';}
    paint();
    let drag=false,px=0,py=0;
    view.addEventListener('pointerdown',(e)=>{drag=true;px=e.clientX;py=e.clientY;view.setPointerCapture(e.pointerId);});
    view.addEventListener('pointermove',(e)=>{if(!drag)return;ox+=e.clientX-px;oy+=e.clientY-py;px=e.clientX;py=e.clientY;paint();});
    view.addEventListener('pointerup',()=>drag=false);view.addEventListener('pointercancel',()=>drag=false);
    const zrow=el('div','croprow');const zl=el('span');zl.textContent=t('Zoom');
    const zr=el('input','cropzoom');zr.type='range';zr.min='1';zr.max='3';zr.step='0.01';zr.value='1';
    zr.oninput=()=>{const cx=VW/2-ox,cy=VH/2-oy,old=scale;zoom=parseFloat(zr.value);const k=(base*zoom)/old;ox=VW/2-cx*k;oy=VH/2-cy*k;paint();};
    zrow.append(zl,zr);
    const acts=el('div','cropacts');
    const cancel=el('button','btn');cancel.style.cssText='background:#eef2f6;color:#46586a';cancel.textContent=t('Cancel');cancel.onclick=()=>scrim.remove();
    const ok=el('button','btn apply');ok.textContent=t('Done');
    ok.onclick=()=>{const c=document.createElement('canvas');c.width=tw;c.height=th;const x=c.getContext('2d');
      const sx=-ox/scale,sy=-oy/scale,sW=VW/scale,sH=VH/scale;x.drawImage(img,sx,sy,sW,sH,0,0,tw,th);
      cb(c.toDataURL('image/jpeg',0.82));scrim.remove();};
    acts.append(cancel,ok);
    panel.append(hd,sub,view,zrow,acts);scrim.append(panel);
    scrim.addEventListener('pointerdown',(e)=>{if(e.target===scrim)scrim.remove();});
    document.body.append(scrim);
  };
  img.src=src;
}
function pickImage(file,tw,th,cb){if(!file||!/^image\//.test(file.type))return;const r=new FileReader();r.onload=()=>openCropper(r.result,tw,th,cb);r.readAsDataURL(file);}

function renderInqLines(container,list){(list||[]).forEach(iq=>{const line=el('div','inqline');const t8=el('span');t8.textContent=tf('Checked out of band: {ch} · {time}',{ch:iq.ch||'',time:ts(iq.at)});line.append(t8);if(iq.note){const n=el('span','inqnote');n.textContent=tf(' ({note})',{note:iq.note});line.append(n);}container.append(line);});}
// 別経路で本人に連絡（照会）パネル。開くのは相手が宣言した経路。行為のみ記録。
// 断り＝ひとこと理由を任意で添えて送る（送信者の修正判断の材料になる）。
function openDecline(pair,id){
  const scrim=el('div','cropscrim'),panel=el('div','croppanel');panel.style.maxWidth='420px';panel.style.width='min(420px,calc(100vw - 40px))';
  const hd=el('div','crophd');hd.textContent=t('Not this one');const sub=el('div','cropsub');sub.textContent=t('Add a word about why? (Optional) The sender will see it.');
  const ta=el('textarea','setin');ta.rows=3;ta.placeholder=t('e.g. Intent unclear / route looks off / no time right now');ta.style.resize='vertical';ta.style.marginTop='10px';
  panel.append(hd,sub,ta);
  const acts=el('div','cropacts');
  const cancel=el('button','btn');cancel.style.cssText='flex:1;background:#eef2f6;color:#46586a';cancel.textContent=t('Never mind');cancel.onclick=()=>scrim.remove();
  const ok=el('button','btn decline');ok.style.flex='1';ok.textContent=t('Decline and send');
  ok.onclick=async()=>{await fetch('/api/decline',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pair,id,reason:ta.value})});scrim.remove();sel=null;refreshBadge();loadList();renderMain();};
  acts.append(cancel,ok);panel.append(acts);
  scrim.append(panel);scrim.addEventListener('pointerdown',(e)=>{if(e.target===scrim)scrim.remove();});document.body.append(scrim);setTimeout(()=>ta.focus(),60);
}
function openVerify(pair,id,L){
  const scrim=el('div','cropscrim'),panel=el('div','croppanel');panel.style.maxWidth='460px';panel.style.width='min(460px,calc(100vw - 40px))';
  const hd=el('div','crophd');hd.textContent=t('Ask the sender what they meant');const sub=el('div','cropsub');sub.textContent=t('Reach the sender directly, out of band.');panel.append(hd,sub);
  if(L.channels&&L.channels.length){const wrap=el('div','chbtns');L.channels.forEach(c=>{const btn=el('button','chbtn');btn.textContent=c.label||c.key;
    btn.onclick=async()=>{const u=chUrl(c.key,c.value);if(u)await fetch('/api/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:u})});
      const r=await (await fetch('/api/inquire',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pair,id,ch:c.label||c.key})})).json();L.inquiries=r.inquiries;renderLog();};wrap.append(btn);});panel.append(wrap);}
  else{const none=el('div','cropsub');none.style.marginTop='6px';none.textContent=t('They have not registered any contact channels yet.');panel.append(none);}
  const logBox=el('div','inqlog');panel.append(logBox);function renderLog(){logBox.textContent='';renderInqLines(logBox,L.inquiries);}renderLog();
  const acts=el('div','cropacts');const close=el('button','btn');close.style.cssText='flex:1;background:#eef2f6;color:#46586a';close.textContent=t('Close');close.onclick=()=>{scrim.remove();renderMain();};acts.append(close);panel.append(acts);
  scrim.append(panel);scrim.addEventListener('pointerdown',(e)=>{if(e.target===scrim){scrim.remove();renderMain();}});document.body.append(scrim);
}
$('settings').onclick=async()=>{const p=await (await fetch('/api/profile')).json();$('pName').value=p.name||'';$('pLinks').value=p.links||'';avatarData=p.avatar||'';bannerData=p.banner||'';renderPics();populateChannels(p.channels);
  const nc=await (await fetch('/api/notify')).json().catch(()=>({}));$('cwToken').value=nc.chatworkToken||'';$('cwRoom').value=nc.chatworkRoom||'';$('cwAccount').value=nc.chatworkAccount||'';
  renderBlocked();
  // 自分の指紋（相手の本人確認に答えるための番号）。state から取る＝常に手元の鍵の値。
  try{const st=await (await fetch('/api/state')).json();$('meFp').textContent=fpGroups(st.me&&st.me.device_id);}catch{}
  $('setScrim').classList.add('on');};
$('pSave').onclick=async()=>{
  await fetch('/api/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('pName').value,icon:'',avatar:avatarData,banner:bannerData,links:$('pLinks').value,channels:collectChannels()})});
  await fetch('/api/notify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chatworkToken:$('cwToken').value,chatworkRoom:$('cwRoom').value,chatworkAccount:$('cwAccount').value})});
  $('pSave').textContent=t('Saved');setTimeout(()=>{$('pSave').textContent=t('Save');closeAll();loadList();renderMe();},700);};

// つながる

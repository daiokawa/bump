// bump 配線盤：自分の設定まわり（プロフィール画像・連絡経路・通知・招待/QR）。

function renderPics(){const a=$('avDrop');if(avatarData){$('avImg').src=avatarData;a.classList.add('has');}else a.classList.remove('has');const b=$('bnDrop');if(bannerData){$('bnImg').src=bannerData;b.classList.add('has');}else b.classList.remove('has');}
// サイドバー頭の常設プロフィールカード（自分のバナー＋アイコン＋名前）。
async function renderMe(){
  let p={};try{p=await (await fetch('/api/profile')).json();}catch{}
  const bn=$('meBn');if(p.banner){$('meBnImg').src=p.banner;bn.classList.add('has');}else bn.classList.remove('has');
  const av=$('meAv');if(p.avatar){$('meAvImg').src=p.avatar;av.classList.add('has');}else av.classList.remove('has');
  const nm=(p.name||'').trim();$('meName').textContent=nm||t('Profile not set');if(nm){$('meAvPh').textContent=nm.slice(0,2);}else{const a=$('meAvPh');a.style.display='flex';a.style.alignItems='center';a.style.justifyContent='center';a.innerHTML='<svg viewBox="0 0 24 24" width="62%" height="62%" fill="rgba(255,255,255,.9)"><circle cx="12" cy="8.2" r="4.2"/><path d="M12 13.6c-4.6 0-8 2.5-8 5.9V21h16v-1.5c0-3.4-3.4-5.9-8-5.9z"/></svg>';}
}
function dz(dropId,fileId,clearId,tw,th,set){
  $(dropId).onclick=(e)=>{if(e.target.id===clearId)return;$(fileId).click();};
  $(clearId).onclick=(e)=>{e.stopPropagation();set('');renderPics();};
  $(fileId).onchange=(e)=>{pickImage(e.target.files[0],tw,th,d=>{set(d);renderPics();});e.target.value='';};
  $(dropId).addEventListener('dragover',(e)=>{e.preventDefault();$(dropId).classList.add('over');});
  $(dropId).addEventListener('dragleave',()=>$(dropId).classList.remove('over'));
  $(dropId).addEventListener('drop',(e)=>{e.preventDefault();$(dropId).classList.remove('over');pickImage(e.dataTransfer.files[0],tw,th,d=>{set(d);renderPics();});});
}
dz('avDrop','pImgFile','avClear',96,96,(v)=>avatarData=v);
dz('bnDrop','bnFile','bnClear',600,200,(v)=>bannerData=v);
window.addEventListener('dragover',(e)=>e.preventDefault());window.addEventListener('drop',(e)=>e.preventDefault());
// 連絡経路（本人確認で相手が開くツール）。設定＝チェックボックス＋リンク/ID。
const CH_PRESETS=[
  {key:'imessage',label:'iMessage',ph:t('Phone number or Apple ID email')},
  {key:'whatsapp',label:'WhatsApp',ph:t('Phone number (e.g. +14155551234)')},
  {key:'signal',label:'Signal',ph:t('Phone number (e.g. +14155551234)')},
  {key:'kakaotalk',label:'KakaoTalk',ph:t('Open chat URL (e.g. https://open.kakao.com/o/...)')},
  {key:'line',label:'LINE',ph:t('LINE URL (e.g. https://line.me/ti/p/~ID)')},
  {key:'telegram',label:'Telegram',ph:t('t.me/username')},
  {key:'messenger',label:'Messenger',ph:t('m.me/username')},
  {key:'x',label:t('X (DM)'),ph:t('x.com/username')},
  {key:'chatwork',label:'Chatwork',ph:t('Chatwork URL')},
  {key:'meet',label:'Google Meet',ph:t('Meet URL')},
  {key:'slack',label:'Slack',ph:t('Slack URL')},
  {key:'mail',label:t('Email'),ph:t('Email address')},
  {key:'tel',label:t('Phone / SMS'),ph:t('Phone number')},
];
// 入力値→開けるURL（mail/telは補完、他はスキームが無ければhttps）。
function chUrl(key,value){const v=(value||'').trim();if(!v)return '';
  if(key==='mail')return v.startsWith('mailto:')?v:'mailto:'+v;
  if(key==='tel')return /^(tel:|sms:)/.test(v)?v:'tel:'+v.replace(/[^\d+]/g,'');
  if(key==='imessage')return v.startsWith('imessage:')?v:'imessage:'+v;
  if(key==='whatsapp')return /^https?:/i.test(v)?v:'https://wa.me/'+v.replace(/\D/g,'');
  if(key==='signal')return /^https?:/i.test(v)?v:'https://signal.me/#p/'+v.replace(/[^\d+]/g,'');
  return /^[a-z][a-z0-9+.-]*:/i.test(v)?v:'https://'+v;}
function buildChannels(){const box=$('chList');box.textContent='';
  const mk=(key,text,ph,extra)=>{const row=el('div','chrow');const lab=el('label');const cb=el('input');cb.type='checkbox';cb.id='ch_'+key;const sp=el('span');sp.textContent=text;lab.append(cb,sp);row.append(lab);
    let linp=null;if(extra){linp=el('input','setin chv');linp.type='text';linp.id='chl_'+key;linp.placeholder=t('Name (e.g. Discord)');linp.style.display='none';row.append(linp);}
    const inp=el('input','setin chv');inp.type='text';inp.id='chv_'+key;inp.placeholder=ph;inp.style.display='none';row.append(inp);
    cb.onchange=()=>{const d=cb.checked?'block':'none';if(linp)linp.style.display=d;inp.style.display=d;if(cb.checked)(linp||inp).focus();};box.append(row);};
  CH_PRESETS.forEach(p=>mk(p.key,p.label,p.ph,false));mk('other',t('Other'),t('Link / ID'),true);}
function populateChannels(channels){buildChannels();(channels||[]).forEach(c=>{const cb=$('ch_'+c.key);if(!cb)return;cb.checked=true;cb.onchange();$('chv_'+c.key).value=c.value||'';if(c.key==='other'&&$('chl_other'))$('chl_other').value=c.label||'';});}
function collectChannels(){const out=[];CH_PRESETS.forEach(p=>{const cb=$('ch_'+p.key);const v=($('chv_'+p.key).value||'').trim();if(cb&&cb.checked&&v)out.push({key:p.key,label:p.label,value:v});});
  const ocb=$('ch_other'),ov=($('chv_other').value||'').trim(),ol=($('chl_other').value||'').trim();if(ocb&&ocb.checked&&ov)out.push({key:'other',label:ol||t('Other'),value:ov});return out;}
// 照会ログ（別経路で連絡しに行った過去の行為）。「確認済み」等の状態は出さない。

let invTimer=null,qrLoaded=false;
// 開くたびに新しいリンクを作る。届くまでは古いリンクを見せず、コピーもさせない（期限切れを写さない）。
async function makeInvite(){
  const box=$('inviteLink'),cp=$('copyBtn'),ex=$('inviteExp');clearInterval(invTimer);
  box.value=t('Making a link…');cp.disabled=true;ex.textContent='';$('reInvite').style.display='none';
  let inv;try{const r=await fetch('/api/invite');if(!r.ok)throw new Error('HTTP '+r.status);inv=await r.json();}
  catch(e){box.value='';ex.textContent=tf('Could not make a link: {msg}',{msg:e.message});$('reInvite').style.display='';return;}
  box.value=location.origin+'/join#i='+inv.token;cp.disabled=false;
  const tick=()=>{const s=Math.max(0,Math.round((Date.parse(inv.expires_at)-Date.now())/1000));
    if(s>0){ex.textContent=tf('Valid for {m}:{s}. When they open it, you are connected automatically within about a minute.',{m:Math.floor(s/60),s:String(s%60).padStart(2,'0')});return;}
    clearInterval(invTimer);ex.textContent=t('This link has expired.');cp.disabled=true;$('reInvite').style.display='';};
  tick();invTimer=setInterval(tick,1000);
}
$('add').onclick=()=>{$('connScrim').classList.add('on');showPaste(false);qrLoaded=false;$('qrSection').style.display='none';$('toggleQR').textContent=t('Connect in person with QR ▾');makeInvite();};
$('reInvite').onclick=()=>makeInvite();
$('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);}catch(e){$('inviteLink').select();document.execCommand('copy');}toast(t('✓ Copied'));};
$('toggleQR').onclick=async()=>{const s=$('qrSection');const showing=s.style.display!=='none';s.style.display=showing?'none':'block';$('toggleQR').textContent=showing?t('Connect in person with QR ▾'):t('Connect in person with QR ▴');
  if(!showing&&!qrLoaded)loadQR();};
// QR も期限つき（5分）。残り時間を出し、切れたら作り直せるようにする（切れたまま見せ続けていた）。
let qrTimer=null;
async function loadQR(){clearInterval(qrTimer);$('qrImg').style.opacity='.25';
  try{const d=await (await fetch('/api/qr')).json();$('qrImg').src=d.dataUri;$('qrImg').style.opacity='1';qrLoaded=true;
    const tick=()=>{const s=Math.max(0,Math.round((Date.parse(d.expires_at)-Date.now())/1000));const ex=$('qrExp');ex.textContent='';
      if(s>0){ex.textContent=tf('They scan it with their camera — recorded as confirmed in person. Valid for {m}:{s}.',{m:Math.floor(s/60),s:String(s%60).padStart(2,'0')});return;}
      clearInterval(qrTimer);$('qrImg').style.opacity='.25';ex.textContent=t('This QR code has expired.')+' ';
      const b=el('button','link');b.textContent=t('Make a new QR code');b.onclick=()=>loadQR();ex.append(b);};
    tick();qrTimer=setInterval(tick,1000);}
  catch(e){$('qrExp').textContent=tf('Could not make a link: {msg}',{msg:e.message});}}
// 受け取ったリンクを貼る：小窓の中で切り替える（← 戻る で招待リンクの画面へ）。
function showPaste(on){$('connMain').style.display=on?'none':'';$('pasteBox').style.display=on?'':'none';if(on){$('pasteIn').value='';$('pasteIn').focus();}}
$('pasteLink').onclick=()=>showPaste(true);
$('pasteBack').onclick=()=>showPaste(false);
$('pasteGo').onclick=async()=>{const raw=$('pasteIn').value.trim();if(!raw){toast(t('Paste a link first.'),'err');return;}
  let bundle=raw;const m=raw.match(/i=([A-Za-z0-9\-_]+)/);if(m){try{const bin=atob(m[1].replace(/-/g,'+').replace(/_/g,'/'));bundle=JSON.parse(new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))));}catch(e){}}/* UTF-8として読む（日本語の名前で署名が合わなくなっていた） */
  const b=$('pasteGo');b.disabled=true;
  try{const r=await postJson('/api/scan',{bundle,via:'paste'});closeAll();toast(t('Connected.'));await setSection('pairs');if(r.id){sel={type:'pair',pair:r.id};renderList();renderMain();}}
  catch(e){toast(tf('Could not connect: {error}',{error:e.message}),'err');}
  b.disabled=false;};

function closeAll(){document.querySelectorAll('.scrim').forEach(s=>s.classList.remove('on'));clearInterval(invTimer);clearInterval(qrTimer);}
document.querySelectorAll('.scrim').forEach(s=>s.addEventListener('click',e=>{if(e.target===s)closeAll();}));

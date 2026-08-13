// bump 配線盤：自分の設定まわり（プロフィール画像・連絡経路・通知・招待/QR）。

function renderPics(){const a=$('avDrop');if(avatarData){$('avImg').src=avatarData;a.classList.add('has');}else a.classList.remove('has');const b=$('bnDrop');if(bannerData){$('bnImg').src=bannerData;b.classList.add('has');}else b.classList.remove('has');}
// サイドバー頭の常設プロフィールカード（自分のバナー＋アイコン＋名前）。
async function renderMe(){
  let p={};try{p=await (await fetch('/api/profile')).json();}catch{}
  const bn=$('meBn');if(p.banner){$('meBnImg').src=p.banner;bn.classList.add('has');}else bn.classList.remove('has');
  const av=$('meAv');if(p.avatar){$('meAvImg').src=p.avatar;av.classList.add('has');}else av.classList.remove('has');
  const nm=(p.name||'').trim();$('meName').textContent=nm||t('Profile not set');$('meAvPh').textContent=(nm||t('?')).slice(0,2);
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
$('add').onclick=async()=>{$('connScrim').classList.add('on');qrLoaded=false;$('qrSection').style.display='none';const inv=await (await fetch('/api/invite')).json();$('inviteLink').value=location.origin+'/join#i='+inv.token;clearInterval(invTimer);const tick=()=>{const s=Math.max(0,Math.round((Date.parse(inv.expires_at)-Date.now())/1000));$('inviteExp').textContent=s>0?tf('Valid for {m}:{s}. When they open it, you are engaged.',{m:Math.floor(s/60),s:String(s%60).padStart(2,'0')}):t('Expired. Close and reopen.');};tick();invTimer=setInterval(tick,1000);};
$('copyBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);}catch(e){$('inviteLink').select();document.execCommand('copy');}$('copyBtn').textContent=t('Copied');setTimeout(()=>$('copyBtn').textContent=t('Copy'),1400);};
$('toggleQR').onclick=async()=>{const s=$('qrSection');const showing=s.style.display!=='none';s.style.display=showing?'none':'block';$('toggleQR').textContent=showing?t('Connect in person with QR ▾'):t('Connect in person with QR ▴');if(!showing&&!qrLoaded){const d=await (await fetch('/api/qr')).json();$('qrImg').src=d.dataUri;qrLoaded=true;$('qrExp').textContent=t('They scan it with their camera — verified on the spot.');}};
$('pasteLink').onclick=async()=>{const raw=prompt(t('Paste the invite link / QR / bundle you received (connects without verification)'));if(!raw)return;let bundle=raw.trim();const m=raw.match(/i=([A-Za-z0-9\-_]+)/);if(m){try{bundle=JSON.parse(atob(m[1].replace(/-/g,'+').replace(/_/g,'/')));}catch(e){}}const r=await (await fetch('/api/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bundle,via:'paste'})})).json();if(r.error){alert(tf('Could not connect: {error}',{error:r.error}));return;}closeAll();setSection('pairs');};

function closeAll(){document.querySelectorAll('.scrim').forEach(s=>s.classList.remove('on'));clearInterval(invTimer);}
document.querySelectorAll('.scrim').forEach(s=>s.addEventListener('click',e=>{if(e.target===s)closeAll();}));

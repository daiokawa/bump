// bump 配線盤：共通部品（DOM小道具・色・時刻・状態）。全ファイルが使うので最初に読む。

const $=(id)=>document.getElementById(id);
const el=(t,c)=>{const n=document.createElement(t);if(c)n.className=c;return n;};
const COLORS=['#2b7fff','#0b7285','#20a565','#c05621','#3563b0'];
const color=(s)=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%COLORS.length;return COLORS[h];};
const ts=(iso)=>{if(!iso)return'';return new Date(iso).toLocaleString('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});};
const nm=(p)=>p.replace('claude-','');
function avaInto(av,{avatar,icon,text}){if(avatar){const im=el('img');im.src=avatar;av.append(im);}else av.textContent=icon||text||'';return av;}
let section='inbox', sel=null, avatarData='', bannerData='', cache={inbox:[],pairs:[],sent:[],pending:[]};

// bump 配線盤：共通部品（DOM小道具・色・時刻・状態）。全ファイルが使うので最初に読む。

const $=(id)=>document.getElementById(id);
const el=(t,c)=>{const n=document.createElement(t);if(c)n.className=c;return n;};
const COLORS=['#2b7fff','#0b7285','#20a565','#c05621','#3563b0'];
const color=(s)=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%COLORS.length;return COLORS[h];};
const ts=(iso)=>{if(!iso)return'';return new Date(iso).toLocaleString(LANG==='ja'?'ja-JP':'en-US',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});};
const nm=(p)=>p.replace('claude-','');
// アイコンの頭文字は表示名から（縁の内部名 pair-xxxx から取ると「PA」になっていた）。
const ini=(label,id)=>String(label||'').replace(/さん$/,'').trim().slice(0,2)||nm(id).slice(0,2).toUpperCase();
// 画像は埋め込み(data:image/)だけ描く。外部URLを描くと開いた瞬間に相手のサーバーへ通信が出る。
const imgOk=(v)=>typeof v==='string'&&/^data:image\/(png|jpeg|webp|gif);base64,/.test(v);
function avaInto(av,{avatar,icon,text}){if(imgOk(avatar)){const im=el('img');im.src=avatar;av.append(im);}else av.textContent=icon||text||'';return av;}
let section='inbox', sel=null, avatarData='', bannerData='', cache={inbox:[],pairs:[],sent:[],pending:[]};

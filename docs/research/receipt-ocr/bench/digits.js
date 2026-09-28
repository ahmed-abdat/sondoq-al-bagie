// Label-free parser for the numeric fields only (works for any engine, incl. one that cannot read Arabic)
const {clean}=require('./parse2');
function num(s){s=s.trim();const d=Math.max(s.lastIndexOf('.'),s.lastIndexOf(','));if(d>=0&&s.length-d-1===2)return parseFloat(s.slice(0,d).replace(/[.,]/g,'')+'.'+s.slice(d+1));return parseFloat(s.replace(/[.,]/g,''))}
function parseDigits(raw){const t=clean(raw).replace(/\n/g,' | ');const r={};
  let d;
  if(d=t.match(/(\d{2}):(\d{2}):(\d{2})\s*\|?\s*(\d{2})-(\d{2})-(\d{2})(?!\d)/))r.date=`20${d[4]}-${d[5]}-${d[6]} ${d[1]}:${d[2]}:${d[3]}`;
  else if(d=t.match(/(?<!\d)(\d{2})-(\d{2})-(\d{2})\s*(\d{2}:\d{2}:\d{2})/))r.date=`20${d[1]}-${d[2]}-${d[3]} ${d[4]}`;
  else if(d=t.match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/)){const tm=(t.match(/\d{2}:\d{2}:\d{2}/)||[''])[0];r.date=`${d[3]}-${d[2]}-${d[1]} ${tm}`}
  const tr=t.match(/T[RB][O0-9]{11}/);const runs=(t.match(/\d{9,21}/g)||[]).filter(x=>!/^\d{8}$/.test(x));
  r.ref=tr?tr[0].slice(0,2)+tr[0].slice(2).replace(/O/g,'0'):runs.sort((a,b)=>b.length-a.length)[0];
  if(r.ref&&/^\d{19,}$/.test(r.ref))r.ref=r.ref.slice(-19);
  const mru=[...t.matchAll(/MRU\)?\s*(\d[\d.,]*\d)|(\d[\d.,]*\d)\s*\(?MRU/g)].sort((a,b)=>a.index-b.index)[0];
  const money=t.match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2}/);const lone=t.match(/:\s*(\d{2,6})\s*\|\s*MRU/);
  r.amountMRU=mru?num(mru[1]||mru[2]):lone?+lone[1]:money?num(money[0]):null;
  r.to=(t.match(/(?<!\d)([234]\d{7})(?!\d)/)||[])[1];
  return r}
module.exports={parseDigits};

const fs=require('fs');
const clean=t=>t.replace(/[‎‏‪-‮]/g,'');
function num(s){s=s.trim();const d=Math.max(s.lastIndexOf('.'),s.lastIndexOf(','));
  if(d>=0&&s.length-d-1===2){return parseFloat(s.slice(0,d).replace(/[.,]/g,'')+'.'+s.slice(d+1))}
  return parseFloat(s.replace(/[.,]/g,''))}
function parse(raw){const t=clean(raw);const r={};
  r.app=/SEDAD|السداد/i.test(t)?'sedad':/Masr|المرجع/i.test(t)?'masrvi':/معرف المعاملة|المستفيد/.test(t)?'bankily':'unknown';
  let m;
  if(r.app==='bankily'){m=t.match(/المبلغ[^:\n]*:\s*([\d.,]+)/);r.ref=(t.match(/معرف المعاملة\s*:\s*(\d{10,})/)||[])[1];r.to=(t.match(/المستفيد\s*:\s*(\d{8})/)||[])[1];}
  if(r.app==='sedad'){m=t.match(/([\d.,]+)\s*أوقية/);const x=t.match(/رقم المعاملة\s*([A-Z]{2}[O0-9]{6,})/);r.ref=x&&(x[1].slice(0,2)+x[1].slice(2).replace(/O/g,'0'));r.to=(t.match(/رقم الهاتف\s*(\d{8})/)||[])[1];r.toName=((t.match(/إلى\s*([A-Za-z'’ .]+)/)||[])[1]||'').trim();}
  if(r.app==='masrvi'){m=t.match(/MRU\s*([\d.,]+)/);r.ref=(t.match(/\b(\d{9})\b/)||[])[1];const lat=(t.match(/[A-Z][A-Za-z'’]+(?:\s+[A-Za-z'’]+)*/g)||[]).filter(w=>!/^(MRU|OK|Masr\w*|Vous|LTE)$/.test(w));r.toName=lat.join(' ');}
  r.amountMRU=m?num(m[1]):null;r.amountOld=r.amountMRU!=null?Math.round(r.amountMRU*10):null;
  let d;
  if(d=t.match(/(\d{2})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2})/))r.date=`20${d[1]}-${d[2]}-${d[3]} ${d[4]}`;
  else if(d=t.match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/)){const tm=(t.match(/\d{2}:\d{2}:\d{2}/)||[''])[0];r.date=`${d[3]}-${d[2]}-${d[1]} ${tm}`}
  return r}
const norm=s=>(s||'').toLowerCase().replace(/[^a-z]/g,'').replace(/ei/g,'el');
const truth={
 'bankily.png':{app:'bankily',amountMRU:100,ref:'0926092814484388261',date:'2026-09-28 14:48:45',to:'2XXXXXXX'},
 'sedad.jpg':{app:'sedad',amountMRU:1500,ref:'TR07258252750',date:'2026-09-11 17:54:42',to:'2XXXXXXX',toName:'<recipient name>'},
 'masrvi-android.jpg':{app:'masrvi',amountMRU:500,ref:'266837993',date:'2026-09-03 10:15:55',toName:'<recipient name>'},
 'masrvi-ios.jpg':{app:'masrvi',amountMRU:100,ref:'250210901',date:'2026-07-23 18:01:07',toName:'<recipient name>'}};
let ok=0,n=0;
for(const [f,tr] of Object.entries(truth)){const r=parse(fs.readFileSync(f+'.txt','utf8'));console.log(f,JSON.stringify(r));
 for(const k of Object.keys(tr)){n++;let good=k==='toName'?(()=>{const a=norm(r.toName),b=norm(tr.toName);return a.includes(b)||b.split('').filter((c,i)=>a[i]===c).length/b.length>.8||[...b].every(c=>a.includes(c))&&Math.abs(a.length-b.length)<=4})():String(r[k])===String(tr[k]);if(good)ok++;console.log('   ',k.padEnd(9),good?'OK ':'XX ',r[k],'|',tr[k])}}
console.log(`fields ${ok}/${n}`);

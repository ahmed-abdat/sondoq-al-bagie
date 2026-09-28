const fs=require('fs');const {parse,score,truth}=require('./parse2');const {parseDigits}=require('./digits');
const K=['amountMRU','ref','date','to'];
function digitScore(base,r){const tr=truth[base];const o={};for(const k of K)if(k in tr)o[k]=String(r[k])===String(tr[k]);return o}
function linesFromItems(items){const it=items.map(i=>{const ys=i.poly.map(p=>p[1]),xs=i.poly.map(p=>p[0]);return{y:(Math.min(...ys)+Math.max(...ys))/2,h:Math.max(...ys)-Math.min(...ys),x:Math.min(...xs),t:i.text.replace(/\r/g,"")}}).sort((a,b)=>a.y-b.y);
  const L=[];for(const i of it){if(L.length&&Math.abs(L[L.length-1][0].y-i.y)<i.h*0.5)L[L.length-1].push(i);else L.push([i])}
  return L.map(l=>l.sort((a,b)=>a.x-b.x).map(x=>x.t).join(' ')).join('\n')}
for(const f of process.argv.slice(2)){const d=JSON.parse(fs.readFileSync(f));let full=[0,0],dig=[0,0];const miss=[];
  for(const o of d.out){const base=o.f.split('__')[0];const text=o.text!=null?o.text:linesFromItems(o.items);
    const s2=digitScore(base,parseDigits(text));dig[0]+=Object.values(s2).filter(Boolean).length;dig[1]+=Object.keys(s2).length;
    if(o.text!=null){const s=score(base,parse(text));full[0]+=Object.values(s).filter(Boolean).length;full[1]+=Object.keys(s).length;if(Object.values(s).some(v=>!v))miss.push(o.f.replace('.png','')+':'+Object.keys(s).filter(k=>!s[k]))}
    else if(Object.values(s2).some(v=>!v))miss.push(o.f.replace('.png','')+':'+Object.keys(s2).filter(k=>!s2[k]))}
  const ms=d.out.map(x=>x.ms);
  console.log(`${f.replace('bout/','').replace('.json','')}\tinit ${Math.round(d.initMs)}ms\tavg ${Math.round(ms.reduce((a,b)=>a+b)/ms.length)}ms\tmax ${Math.round(Math.max(...ms))}\tmem+ ${Math.round(d.peakMB-d.baseMB)}MB\tfull ${full[1]?full.join('/'):'-'}\tdigits ${dig.join('/')}${process.env.V?'\n   '+miss.join(' '):''}`)}

// re-score saved OCR text with current parser; optional merge of two runs (adaptive: second pass only fills missing fields)
const fs=require('fs');const {parse,score,truth}=require('./parse2');
const dirs=process.argv.slice(2);let tot=0,ok=0;const per={};
for(const f of fs.readdirSync('out/'+dirs[0]).sort()){const base=f.split('__')[0],v=f.split('__')[1].replace('.png.txt','');
  let r=parse(fs.readFileSync('out/'+dirs[0]+'/'+f,'utf8'));let s=score(base,r);
  if(dirs[1]&&Object.keys(truth[base]).some(k=>r[k]==null||r[k]===''||(k==='date'&&!/\d\d:\d\d:\d\d/.test(r[k])))){const r2=parse(fs.readFileSync('out/'+dirs[1]+'/'+f,'utf8'));
    for(const k of Object.keys(r2))if(r[k]==null||r[k]===''||(k==='date'&&!/\d\d:\d\d:\d\d/.test(r[k])))r[k]=r2[k];s=score(base,r);}
  const n=Object.values(s).filter(Boolean).length;tot+=Object.keys(s).length;ok+=n;(per[v]=per[v]||[0,0]);per[v][0]+=n;per[v][1]+=Object.keys(s).length;
  if(process.env.V&&n<Object.keys(s).length)console.log(base,v,Object.keys(s).filter(k=>!s[k]).join(','),JSON.stringify(r));}
console.log(dirs.join(' -> '),`${ok}/${tot}`,Object.entries(per).map(([k,[a,b]])=>`${k}:${a}/${b}`).join(' '));

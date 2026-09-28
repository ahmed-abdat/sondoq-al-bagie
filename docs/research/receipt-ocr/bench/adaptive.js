const fs=require('fs');const {parse,score,truth}=require('./parse2');const {validate}=require('./validate');
const tok=(e)=>(g)=>require('./parse2').score('x',{})&&0; // unused
const {score:sc}=require('./parse2');
function fundFor(base){const t=truth[base];const f={};if('to' in t)f.to=t.to;if('toName' in t)f.nameOk=n=>sc(base,{...t,toName:n}).toName, f.toName=t.toName;return f}
const [rawF,preF]=process.argv.slice(2);const A=JSON.parse(fs.readFileSync(rawF)).out,B=preF?JSON.parse(fs.readFileSync(preF)).out:null;
let st={correct:0,flagged:0,silent:0,total:0,second:0,auto:0,imgs:0};const silentList=[];
for(let i=0;i<A.length;i++){const base=A[i].f.split('__')[0];const fund=fundFor(base);
  let r=parse(A[i].text),v=validate(r,fund);let ms=A[i].ms;
  if(B&&Object.values(v).some(x=>!x)){st.second++;ms+=B[i].ms;const r2=parse(B[i].text),v2=validate(r2,fund);for(const k of Object.keys(v))if(!v[k]&&v2[k]){r[k]=r2[k];v[k]=true}}
  const s=score(base,r);st.imgs++;let allok=true;
  for(const k of Object.keys(s)){st.total++;const vk=k in v?v[k]:true;if(!vk){st.flagged++;allok=false}else if(s[k])st.correct++;else{st.silent++;silentList.push(A[i].f+':'+k+'='+r[k])}}
  if(allok)st.auto++;}
console.log(JSON.stringify(st),silentList.join(' '));

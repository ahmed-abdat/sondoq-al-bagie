// Duty-cycle CPU throttler for a whole process tree (like cpulimit): simulates a slower phone CPU, including Web Workers.
const fs=require('fs');
function tree(root){const all=[root];let found=true;const kids={};
  for(const d of fs.readdirSync('/proc')){if(!/^\d+$/.test(d))continue;try{const st=fs.readFileSync(`/proc/${d}/stat`,'utf8');const pp=+st.slice(st.lastIndexOf(')')+2).split(' ')[1];(kids[pp]=kids[pp]||[]).push(+d)}catch{}}
  for(let i=0;i<all.length;i++)for(const k of kids[all[i]]||[])all.push(k);return all}
function pss(pids){let s=0;for(const p of pids){try{const m=fs.readFileSync(`/proc/${p}/smaps_rollup`,'utf8').match(/^Pss:\s+(\d+)/m);if(m)s+=+m[1]}catch{}}return s/1024}
function start(root,rate,period=20){let pids=tree(root),stop=false,peak=0;
  const refresh=setInterval(()=>{pids=tree(root);peak=Math.max(peak,pss(pids))},300);
  if(rate>1)(function cycle(){if(stop)return;const off=period*(1-1/rate),on=period/rate;
    for(const p of pids)try{process.kill(p,'SIGSTOP')}catch{}
    setTimeout(()=>{for(const p of pids)try{process.kill(p,'SIGCONT')}catch{};if(!stop)setTimeout(cycle,on)},off)})();
  return {stop(){stop=true;clearInterval(refresh);for(const p of tree(root))try{process.kill(p,'SIGCONT')}catch{}},peak:()=>peak,resetPeak(){peak=0},pss:()=>pss(tree(root))}}
module.exports={start,tree,pss};

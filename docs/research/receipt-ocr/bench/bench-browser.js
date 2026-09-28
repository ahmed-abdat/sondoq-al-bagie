const puppeteer=require('puppeteer-core');const fs=require('fs');const T=require('./throttler');
const port=8090+Math.floor(Math.random()*500);require('./serve')(__dirname+'/web',port);
const [engine,rate,pre,which,threads]=[process.argv[2],+process.argv[3],process.argv[4]==='pre',process.argv[5]||'all',+(process.argv[6]||1)];
let files=fs.readdirSync('web/img').filter(f=>f.endsWith('.png')).sort();
if(which!=='all')files=files.filter(f=>which.split(',').some(w=>f.includes('__'+w+'.')));
(async()=>{const b=await puppeteer.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox','--js-flags=--max-old-space-size=4096']});
 const p=await b.newPage();p.on('console',m=>{if(m.type()==='error')console.error('page:',m.text().slice(0,200))});p.on('pageerror',e=>console.error('pageerr',e.message));
 await p.goto(`http://localhost:${port}/${engine}.html`);if(engine==='paddle')await p.waitForFunction('window.ready');
 const th=T.start(b.process().pid,rate);await new Promise(r=>setTimeout(r,500));const base=th.pss();
 const initMs=await p.evaluate((e,t)=>init(e==='tess'?'ara+eng':t),engine,threads);const afterInit=th.pss();th.resetPeak();
 const out=[];for(const f of files){const r=await p.evaluate((f,pre)=>ocr(f,pre),f,pre);out.push({f,...r});process.stderr.write('.')}
 const peak=Math.max(th.peak(),th.pss());th.stop();
 const tag=`${engine}${threads>1?'-t'+threads:''}-r${rate}${pre?'-pre':''}-${which}`;fs.mkdirSync('bout',{recursive:true});
 fs.writeFileSync(`bout/${tag}.json`,JSON.stringify({engine,rate,pre,threads,initMs,baseMB:base,afterInitMB:afterInit,peakMB:peak,out}));
 const ms=out.map(x=>x.ms);console.log(`\n${tag}: init ${Math.round(initMs)}ms, per-image avg ${Math.round(ms.reduce((a,b)=>a+b)/ms.length)}ms max ${Math.round(Math.max(...ms))}ms, mem base ${Math.round(base)}MB afterInit ${Math.round(afterInit)}MB peak ${Math.round(peak)}MB`);
 await b.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});

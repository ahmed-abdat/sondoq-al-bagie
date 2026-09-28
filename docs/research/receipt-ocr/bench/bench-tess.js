const T=require('tesseract.js');const fs=require('fs');const sharp=require('sharp');
const {parse,score}=require('./parse2');
const langs=process.argv[2]||'ara+eng', pre=process.argv[3]==='pre';
async function prep(f){ // grayscale, auto-invert dark images, upscale small ones
  const img=sharp(f).grayscale();const st=await img.clone().stats();const meta=await sharp(f).metadata();
  let p=sharp(f).grayscale(); if(st.channels[0].mean<110)p=p.negate({alpha:false});
  if(meta.width<900)p=p.resize({width:Math.round(meta.width*Math.min(2.5,1080/meta.width)),kernel:'lanczos3'});
  return p.normalize().png().toBuffer();}
(async()=>{const w=await T.createWorker(langs,1,{langPath:__dirname+'/lang',cacheMethod:'none'});
 const files=fs.readdirSync('var').sort();const rows=[];let tot=0,okc=0,ms=0;
 for(const f of files){const base=f.split('__')[0],v=f.split('__')[1].replace('.png','');
  const input=pre?await prep('var/'+f):'var/'+f;const t0=Date.now();const {data}=await w.recognize(input);const dt=Date.now()-t0;ms+=dt;
  const r=parse(data.text);const s=score(base,r);const n=Object.values(s).filter(Boolean).length;tot+=Object.keys(s).length;okc+=n;
  fs.mkdirSync('out/tess-'+langs+(pre?'-pre':''),{recursive:true});fs.writeFileSync('out/tess-'+langs+(pre?'-pre':'')+'/'+f+'.txt',data.text);
  rows.push({base,v,dt,n,of:Object.keys(s).length,miss:Object.keys(s).filter(k=>!s[k]).join(',')});}
 await w.terminate();
 for(const x of rows)console.log(`${x.base.padEnd(15)} ${x.v.padEnd(9)} ${String(x.dt).padStart(5)}ms ${x.n}/${x.of} ${x.miss}`);
 console.log(`TOTAL ${langs} pre=${pre}: ${okc}/${tot} fields, avg ${Math.round(ms/files.length)}ms`);
 fs.writeFileSync(`out/res-tess-${langs}${pre?'-pre':''}.json`,JSON.stringify(rows));})();

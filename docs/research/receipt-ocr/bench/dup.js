// Duplicate detection: exact SHA-256 vs perceptual dHash (64-bit) across the 32 variants
const sharp=require('sharp'),fs=require('fs'),crypto=require('crypto');
async function dhash(f){// crop to middle band (drop status bar/nav bar), 9x8 grayscale, compare neighbours
  const m=await sharp(f).metadata();const img=sharp(f).extract({left:0,top:Math.round(m.height*0.08),width:m.width,height:Math.round(m.height*0.84)});
  const px=await img.grayscale().resize(9,8,{fit:'fill'}).raw().toBuffer();let h=0n;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)h=(h<<1n)|(px[y*9+x]>px[y*9+x+1]?1n:0n);return h}
const ham=(a,b)=>{let x=a^b,c=0;while(x){c+=Number(x&1n);x>>=1n}return c};
(async()=>{const fl=fs.readdirSync('var').filter(f=>/__(orig|whatsapp|lowres|blur|dim)\./.test(f));const H={};
 for(const f of fl)H[f]=await dhash('var/'+f);
 const same=[],diff=[];for(let i=0;i<fl.length;i++)for(let j=i+1;j<fl.length;j++){const d=ham(H[fl[i]],H[fl[j]]);(fl[i].split('__')[0]===fl[j].split('__')[0]?same:diff).push(d)}
 console.log('same receipt, re-encoded (whatsapp/lowres/blur/dim): max dist',Math.max(...same),'| different receipts: min dist',Math.min(...diff));
 const sha=new Set(fl.map(f=>crypto.createHash('sha256').update(fs.readFileSync('var/'+f)).digest('hex')));console.log('sha256 unique among',fl.length,':',sha.size);
 // near-identical but different receipts: same app, same layout, different amount -> check masrvi android vs ios distance
})();

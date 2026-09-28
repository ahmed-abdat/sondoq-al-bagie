const T=require('tesseract.js');const fs=require('fs');
(async()=>{const w=await T.createWorker('ara+eng',1,{langPath:__dirname+'/lang'});
for(const f of ['bankily.png','sedad.jpg','masrvi-android.jpg','masrvi-ios.jpg']){const t0=Date.now();const {data}=await w.recognize(f);fs.writeFileSync(f+'.txt',data.text);console.log('=== '+f+' '+(Date.now()-t0)+'ms\n'+data.text)}
await w.terminate()})();

// Label-anchored receipt parser shared by all engines.
const AR_DIG='٠١٢٣٤٥٦٧٨٩', FA_DIG='۰۱۲۳۴۵۶۷۸۹';
function clean(t){
  t=t.replace(/[‎‏‪-‮⁦-⁩]/g,'');
  t=t.replace(/[٠-٩]/g,c=>AR_DIG.indexOf(c)).replace(/[۰-۹]/g,c=>FA_DIG.indexOf(c));
  return t.replace(/[٫]/g,',').replace(/[٬]/g,'.');
}
function num(s){s=s.trim().replace(/[.,]+$/,'');const d=Math.max(s.lastIndexOf('.'),s.lastIndexOf(','));
  if(d>=0&&s.length-d-1===2)return parseFloat(s.slice(0,d).replace(/[.,]/g,'')+'.'+s.slice(d+1));
  return parseFloat(s.replace(/[.,]/g,''))}
const N='(\\d{1,3}(?:[.,\\s]\\d{3})*(?:[.,]\\d{2})?|\\d+(?:[.,]\\d{2})?)';
function parse(raw){
  const t=clean(raw), flat=t.replace(/\n/g,' ');
  const r={};
  r.app=/SEDAD|السداد|رقم المعاملة/i.test(t)?'sedad':/Masr|المرجع|MRU\s*\d+[.,]\d\d\s*\(/i.test(t)?'masrvi':/معرف المعاملة|المستفيد|النقل ناجح/.test(t)?'bankily':'unknown';
  let m=null;
  if(r.app==='bankily'){
    m=flat.match(new RegExp('المرسل\\s*:?\\s*'+N))||flat.match(new RegExp(N+'\\s*MRU'));
    r.ref=(flat.match(/المعاملة\s*:?\s*(\d{15,22})/)||flat.match(/\b(\d{17,21})\b/)||[])[1];
    r.to=(flat.match(/المستفيد\s*:?\s*([234]\d{7})\b/)||flat.match(/\b([234]\d{7})\b/)||[])[1];
  }
  if(r.app==='sedad'){
    m=flat.match(new RegExp(N+'\\s*أوقية'))||flat.match(new RegExp('بإرسال\\s*'+N));
    const x=flat.match(/\b(T[RB][O0-9]{9,13})\b/)||flat.match(/رقم المعاملة\s*([A-Z]{2}[O0-9]{6,})/);
    r.ref=x&&(x[1].slice(0,2)+x[1].slice(2).replace(/O/g,'0'));
    r.to=(flat.match(/\b([234]\d{7})\b/)||[])[1];
    r.toName=((flat.match(/إلى\s*([A-Za-z'’ .]{3,})/)||flat.match(/([A-Z][A-Za-z'’]+ [A-Z][A-Za-z'’]+)\s*إلى/)||[])[1]||'').trim();
  }
  if(r.app==='masrvi'){
    // take the earliest amount next to MRU, whichever side OCR put the label on (first one is the sent amount)
    const a=[...flat.matchAll(new RegExp('MRU\\)?\\s*'+N,'g')),...flat.matchAll(new RegExp(N+'\\s*\\(?MRU','g'))].sort((x,y)=>x.index-y.index);
    m=a[0]||null;
    r.ref=(flat.match(/المرجع\s*(\d{8,10})/)||flat.match(/(\d{8,10})\s*المرجع/)||flat.match(/\b(\d{9})\b/)||[])[1];
    const lat=(flat.match(/[A-Z][A-Za-z'’]+(?:\s+[A-Za-z'’]+)*/g)||[]).filter(w=>!/^(MRU|OK|Masr\w*|Vous|LTE|Terminer)$/.test(w));
    r.toName=lat.join(' ');
  }
  r.amountMRU=m?num(m[1]):null;
  let d;
  if(d=flat.match(/(\d{2})-(\d{2})-(\d{2})\s+(\d{2}:\d{2}:\d{2})/))r.date=`20${d[1]}-${d[2]}-${d[3]} ${d[4]}`;
  else if(d=flat.match(/(\d{2}:\d{2}:\d{2})\s+(\d{2})-(\d{2})-(\d{2})\b(?!\d)/))r.date=`20${d[2]}-${d[3]}-${d[4]} ${d[1]}`;
  else if(d=flat.match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/)){const tm=(flat.match(/\d{2}:\d{2}:\d{2}/)||[''])[0];r.date=`${d[3]}-${d[2]}-${d[1]} ${tm}`}
  return r;
}
const normN=s=>(s||'').toLowerCase().replace(/[^a-z]/g,'').replace(/ei/g,'el');
const truth={
 bankily:{app:'bankily',amountMRU:100,ref:'0926092814484388261',date:'2026-09-28 14:48:45',to:'2XXXXXXX'},
 sedad:{app:'sedad',amountMRU:1500,ref:'TR07258252750',date:'2026-09-11 17:54:42',to:'2XXXXXXX',toName:'<recipient name>'},
 'masrvi-android':{app:'masrvi',amountMRU:500,ref:'266837993',date:'2026-09-03 10:15:55',toName:'<recipient name>'},
 'masrvi-ios':{app:'masrvi',amountMRU:100,ref:'250210901',date:'2026-07-23 18:01:07',toName:'<recipient name>'}};
function nameOk(a,b){a=normN(a);b=normN(b);if(!a)return false;if(a.includes(b))return true;
  // token-level: >=70% of expected tokens found approximately
  return false}
function tokOk(got,exp){const g=(got||'').toLowerCase().replace(/[^a-z ]/g,' ').split(/\s+/).filter(Boolean);
  const e=exp.toLowerCase().replace(/[^a-z ]/g,' ').split(/\s+/).filter(Boolean);
  const lev=(a,b)=>{const d=[...Array(b.length+1).keys()];for(let i=1;i<=a.length;i++){let p=d[0];d[0]=i;for(let j=1;j<=b.length;j++){const t=d[j];d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));p=t}}return d[b.length]};
  const hit=e.filter(x=>g.some(y=>lev(x,y)<=Math.max(1,Math.floor(x.length/4)))).length;return hit/e.length>=0.7}
function score(base,r){const tr=truth[base];const out={};
  for(const k of Object.keys(tr)){out[k]=k==='toName'?(nameOk(r.toName,tr.toName)||tokOk(r.toName,tr.toName)):String(r[k])===String(tr[k])}
  return out}
module.exports={parse,score,truth,clean};

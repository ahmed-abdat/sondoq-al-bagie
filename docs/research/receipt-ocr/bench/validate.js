// Per-field sanity checks the app can run without knowing the truth. Invalid => ask the user to type/confirm that field.
const FMT={bankily:/^\d{19}$/,sedad:/^TR\d{11}$/,masrvi:/^\d{9}$/};
function validDate(s){const m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s||'');if(!m)return false;const d=new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
  return !isNaN(d)&&d<=new Date('2026-09-29')&&d>=new Date('2025-06-01')}
function validate(r,fund){const v={};v.app=r.app&&r.app!=='unknown';
  v.amountMRU=r.amountMRU!=null&&r.amountMRU>0&&r.amountMRU<=100000;
  v.date=validDate(r.date);
  v.ref=!!(v.app&&FMT[r.app].test(r.ref||''));
  if(v.ref&&r.app==='bankily'&&v.date){ // Bankily ID seems to embed yymmddhhmmss after 2 chars (seen on 1 receipt: inferred)
    const e=r.ref.slice(2,14),dd=r.date.replace(/\D/g,'').slice(2);v.ref=Math.abs(Date.parse('20'+e.replace(/(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/,'$1-$2-$3T$4:$5:$6Z'))-Date.parse('20'+dd.replace(/(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)/,'$1-$2-$3T$4:$5:$6Z')))<10*60e3}
  if('to' in fund)v.to=r.to===fund.to;            // compared with the fund's own number
  if('toName' in fund)v.toName=fund.nameOk(r.toName); // fuzzy compared with the fund's account-holder name
  return v}
module.exports={validate};

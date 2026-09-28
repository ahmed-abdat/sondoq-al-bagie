async function loadImg(src){const im=new Image();im.src=src;await im.decode();return im}
// grayscale + auto-invert dark screenshots + upscale small ones + contrast stretch
function prep(im){const s=im.naturalWidth<900?Math.min(2.5,1080/im.naturalWidth):1;const c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*s);c.height=Math.round(im.naturalHeight*s);
 const x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(im,0,0,c.width,c.height);const d=x.getImageData(0,0,c.width,c.height),p=d.data;
 const g=new Uint8ClampedArray(p.length/4);let sum=0;for(let i=0,j=0;i<p.length;i+=4,j++){g[j]=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2];sum+=g[j]}
 const inv=sum/g.length<110;const h=new Array(256).fill(0);for(const v of g)h[inv?255-v:v]++;
 let lo=0,hi=255,acc=0;for(;lo<255&&(acc+=h[lo])<g.length*0.01;lo++);acc=0;for(;hi>0&&(acc+=h[hi])<g.length*0.01;hi--);
 for(let i=0,j=0;i<p.length;i+=4,j++){let v=inv?255-g[j]:g[j];v=(v-lo)*255/Math.max(1,hi-lo);p[i]=p[i+1]=p[i+2]=v}
 x.putImageData(d,0,0);return c}

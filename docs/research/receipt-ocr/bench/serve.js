const http=require('http'),fs=require('fs'),path=require('path');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.png':'image/png','.gz':'application/gzip','.tar':'application/x-tar','.json':'application/json'};
module.exports=(root,port)=>http.createServer((q,s)=>{const p=path.join(root,decodeURIComponent(q.url.split('?')[0]));
 fs.readFile(p,(e,d)=>{if(e){s.writeHead(404);return s.end()}s.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});s.end(d)})}).listen(port);

import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!filename.startsWith(root+path.sep)||!['index.html','styles.css','core.js','app.js','config.js','demo.js'].includes(path.basename(filename))){res.writeHead(404);res.end('Not found');return;}
    const body=await readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'text/plain','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
});
const port=Number(process.env.PORT||4173);server.listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));

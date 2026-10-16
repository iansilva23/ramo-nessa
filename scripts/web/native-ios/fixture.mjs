// CI-only HTTPS fixture and passive geometry recorder. Never deployed to the VPS.
import { createServer } from 'node:https';
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { webSecurityPolicy } from '../web_security_policy.mjs';
import { prepareBrowserSessionRequest, browserAuthResponse } from '../../../backend/core/dist/src/auth/browser-session-transport.js';
const root=resolve('apps/passenger/build/web'), out=resolve('artifacts/native-ios'); mkdirSync(out,{recursive:true});
const token='fixture-native-audit-private-passenger-abcdefghijklmnopqrstuvwxyz';
const session={accessToken:token,subjectType:'passenger',subjectId:'native-fixture-passenger',expiresAt:new Date(Date.now()+3600000).toISOString(),tokenType:'Bearer'};
const origin='https://localhost:9443';
const instrumentation=`
(() => {
 const rect = e => { if(!e)return null; const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}; };
 const sample = (kind,e) => {
  const v=window.visualViewport;
  const data={kind,t:performance.now(),standalone:navigator.standalone===true,displayStandalone:matchMedia('(display-mode: standalone)').matches,
   viewport:{innerWidth,innerHeight,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,scale:v?.scale,offsetTop:v?.offsetTop,offsetLeft:v?.offsetLeft,width:v?.width,height:v?.height,scrollX,scrollY},
   view:rect(document.querySelector('flutter-view')),semantics:rect(document.querySelector('flt-semantics-host')),
   semanticsEnabled:document.querySelectorAll('flt-semantics-host flt-semantics').length>0,
   touch:e?{x:e.clientX,y:e.clientY,pageX:e.pageX,pageY:e.pageY,offsetX:e.offsetX,offsetY:e.offsetY,target:e.target?.tagName,hit:document.elementFromPoint(e.clientX,e.clientY)?.tagName}:null};
  fetch('/audit/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),keepalive:true}).catch(()=>{});
 };
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(s,e){e({code:1,message:'CI fixture denies GPS'});},watchPosition(s,e){e({code:1,message:'CI fixture denies GPS'});return 1;},clearWatch(){}}});
 const query=navigator.permissions?.query?.bind(navigator.permissions);
 if(query)navigator.permissions.query = d => d.name==='geolocation'?Promise.resolve({state:'denied',addEventListener(){},removeEventListener(){}}):query(d);
 for(const name of ['pageshow','resize','orientationchange','focus','blur'])addEventListener(name,()=>sample(name),{passive:true});
 for(const name of ['pointerdown','pointerup','click'])addEventListener(name,e=>sample(name,e),{capture:true,passive:true});
 for(const name of ['resize','scroll'])visualViewport?.addEventListener(name,()=>sample('visual-'+name),{passive:true});
 for(const delay of [0,100,300,1000,3000,7000])setTimeout(()=>sample('startup-'+delay),delay);
})();`;
let count=0;
const server=createServer({key:readFileSync('artifacts/native-ios/key.pem'),cert:readFileSync('artifacts/native-ios/cert.pem')},(req,res)=>{
 const path=new URL(req.url,origin).pathname;
 if(path.startsWith('/audit/')){
  if(path==='/audit/event') {let body='';req.on('data',c=>{body+=c;if(body.length>16000)req.destroy();});req.on('end',()=>{try{const data=JSON.parse(body);appendFileSync(out+'/geometry.jsonl',JSON.stringify(data)+'\n');}catch{}res.writeHead(204);res.end();});return;}
  appendFileSync(out+'/phases.jsonl',JSON.stringify({path,at:new Date().toISOString()})+'\n');res.end('ok');return;
 }
 if(path.startsWith('/v1/')){
  appendFileSync(out+'/endpoints.jsonl',JSON.stringify({method:req.method,path})+'\n');
  try{
   prepareBrowserSessionRequest(req,{cookieBootstrap:path==='/v1/auth/web/session'&&req.method==='GET'});
   res.setHeader('content-type','application/json');
   if(path==='/v1/auth/web/session'){res.end(JSON.stringify(browserAuthResponse(req,res,session,{setCookie:false})));return;}
   if(path==='/v1/auth/me/check'){res.end(JSON.stringify({subjectId:session.subjectId,subjectType:'passenger',expiresAt:session.expiresAt}));return;}
   res.writeHead(404);res.end('{}');return;
  }catch{res.writeHead(401);res.end('{}');return;}
 }
 if(path==='/fixtures/maps.js'){res.setHeader('content-type','text/javascript');let body=readFileSync('scripts/web/maps_test_stub.js','utf8');
  if(process.env.RAMO_AUDIT_CAPTURE_MAP==='1')body+=`\n(() => { const Original=google.maps.Map; google.maps.Map=class extends Original { constructor(el,opts){ super(el,opts); for(const name of ['pointerdown','pointerup','pointermove','touchstart','touchend','click'])el.addEventListener(name,e=>e.stopPropagation(),{passive:true}); } }; })();`;
  res.end(body);return;}
 if(path==='/fixtures/geometry.js'){res.setHeader('content-type','text/javascript');res.end(instrumentation);return;}
 if(!path.startsWith('/passageiro/')){res.writeHead(404);res.end();return;}
 const file=resolve(root,decodeURIComponent(path.slice('/passageiro/'.length))||'index.html');
 if(!file.startsWith(root+'/')){res.writeHead(404);res.end();return;}
 try{
  let body=readFileSync(file);
  if(file.endsWith('/index.html')){
   body=Buffer.from(body.toString().replace(/<script src="https:\/\/maps\.googleapis\.com\/maps\/api\/js[^"\n]*"><\/script>/,'<script src="/fixtures/maps.js"></script><script src="/fixtures/geometry.js"></script>'));
   res.setHeader('set-cookie','__Host-ramo_passenger='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict');
  }
  res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.ttf':'font/ttf','.otf':'font/otf'})[extname(file)]??'application/octet-stream','cache-control':'no-store','content-security-policy':webSecurityPolicy('passenger',origin)});res.end(body);
 }catch{res.writeHead(404);res.end();}
});
server.listen(9443,'0.0.0.0',()=>console.log('Isolated native iOS fixture ready; no production credentials.'));

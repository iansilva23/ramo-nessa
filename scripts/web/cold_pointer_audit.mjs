// Audit only: first real-coordinate touch, without enabling Flutter semantics first.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { launchTestBrowser } from './browser_test_runtime.mjs';
const mode=process.env.RAMO_COLD_MODE, semantics=process.env.RAMO_COLD_SEMANTICS;
const out=resolve('artifacts/native-ios'), label=mode+'-'+semantics; await mkdir(out,{recursive:true});
const browser=await launchTestBrowser();
const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:430,height:932},deviceScaleFactor:3,isMobile:true,hasTouch:true,
 userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1'});
page.setDefaultTimeout(20000);
const remote=[]; await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin==='https://localhost:9443')return r.continue();remote.push(u.origin);return r.abort();});
await page.addInitScript(installed=>Object.defineProperty(navigator,'standalone',{configurable:true,value:installed}),mode==='standalone');
function findAvatar(file){
 return JSON.parse(execFileSync('python3',['-c',`
from PIL import Image
import json,sys
im=Image.open(sys.argv[1]).convert('RGB');w,h=im.size;r=w/430
rows=[]
for y in range(0,min(h,int(250*r))):
 c=sum(1 for x in range(int(18*r),int(70*r)) if min(im.getpixel((x,y)))>230)
 if 12*r<=c<=49*r:rows.append(y)
groups=[]
for y in rows:
 if not groups or y>groups[-1][-1]+1:groups.append([y])
 else:groups[-1].append(y)
groups=[g for g in groups if len(g)>=28*r]
if not groups:print('null');sys.exit()
g=groups[0];xs=[x for y in g for x in range(int(18*r),int(70*r)) if min(im.getpixel((x,y)))>230]
print(json.dumps({'x':(min(xs)+max(xs))/2/r,'y':(g[0]+g[-1])/2/r,'top':g[0]/r,'bottom':g[-1]/r}))
`,file],{encoding:'utf8'}));
}
async function geometry(){return page.evaluate(()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};return{semanticsEnabled:document.querySelectorAll('flt-semantics-host flt-semantics').length>0,view:rect(document.querySelector('flutter-view')),viewport:{width:innerWidth,height:innerHeight,scale:visualViewport?.scale,offsetTop:visualViewport?.offsetTop,offsetLeft:visualViewport?.offsetLeft,scrollY},viewportMeta:[...document.querySelectorAll('meta[name="viewport"]')].map(e=>e.content)};});}
try{
 await page.goto('https://localhost:9443/passageiro/');
 await page.waitForSelector('flutter-view',{timeout:60000});
 if(semantics==='enabled')await page.locator('flt-semantics-placeholder').dispatchEvent('click');
 let position=null;const before=resolve(out,label+'-before.png');
 for(let i=0;i<12&&!position;i++){await page.waitForTimeout(1000);await page.screenshot({path:before,timeout:10000});position=findAvatar(before);}
 if(!position)throw Error('Painted avatar not identified; no guessed click performed.');
 const initial=await geometry();
 const freeMap=await page.evaluate(()=>!!document.elementFromPoint(215,250)?.closest('[id^="plugins.flutter.io/google_maps_"]'));
 if(!freeMap)throw Error('The unpainted map area is blocked by an overlay.');
 const target=await page.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return{tag:e?.tagName,id:e?.id,isMap:!!e?.closest('[id^="plugins.flutter.io/google_maps_"]')};},position);
 const endpointsBefore=await readFile(resolve(out,'endpoints.jsonl'),'utf8').catch(()=>'');
 await page.touchscreen.tap(position.x,position.y);
 await page.waitForTimeout(1000);
 const after=resolve(out,label+'-after.png');await page.screenshot({path:after,timeout:10000});
 const endpointsAfter=await readFile(resolve(out,'endpoints.jsonl'),'utf8').catch(()=>'');
 const report={sourceCommit:process.env.GITHUB_SHA??'local',mode,mapCapturesEvents:process.env.RAMO_AUDIT_CAPTURE_MAP==='1',semanticsSetup:semantics,physicalIos:false,actualHomeScreen:false,
   initial,painted:position,nativeDomHit:target,after:await geometry(),avatarFoundAfter:findAvatar(after),newEndpoints:endpointsAfter.slice(endpointsBefore.length).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)),remoteOrigins:[...new Set(remote)]};
 await writeFile(resolve(out,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(semantics==='cold' && initial.semanticsEnabled)throw Error('Cold test unexpectedly enabled semantics.');
 if(target.isMap)throw Error('Map received a touch intended for the avatar.');
 if(report.avatarFoundAfter)throw Error('Profile did not replace the painted map controls after first tap.');
 if(remote.length)throw Error('Unexpected external request was blocked.');
}finally{await browser.close();}

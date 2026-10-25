// Full installer rehearsal with real Caddy and the exact configured release ZIP.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,cpSync,rmSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {installDriverRideWeb} from './driver-responsive-web-update.mjs';
import {escapeCompose} from './asaas-activation-plan-contract.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.getuid?.()!==0)throw Error('Root CI only.');
const archive=resolve(process.argv[2]),checksum=createHash('sha256').update(readFileSync(archive)).digest('hex');
function command(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:32*1024**2,timeout:180000});if(r.error||r.status!==0)throw Error(cmd+': '+r.stderr);return r.stdout;}
const docker=a=>command('docker',a);
for(const scenario of ['success','after-switch','missing-gateway']){
 const failAfterSwitch=scenario==='after-switch',failWithMissingGateway=scenario==='missing-gateway',shouldFail=scenario!=='success';
 const dir=mkdtempSync(join(tmpdir(),'driver-ride-ci-')),prefix='driver-ride-ci-'+randomBytes(4).toString('hex'),names=Object.fromEntries(['core','gateway','postgres','site'].map(k=>[k,prefix+'-'+k])),net=prefix+'-net',created=[];
 let network=false;const volumes=[prefix+'-data',prefix+'-config'];const madeVolumes=[];
 try{
  const image=JSON.parse(docker(['image','inspect','caddy:2.11.7-alpine']))[0].Id;
  const old=join(dir,'old');mkdirSync(old,{mode:0o755});
  command('python3',[new URL('./stage-driver-responsive-web.py',import.meta.url).pathname,'--archive',archive,'--sha256',checksum,'--output',join(old,'driver')]);
  writeFileSync(join(old,'driver','main.dart.js'),'old driver retained');
  cpSync(join(old,'driver'),join(old,'passenger'),{recursive:true});
  writeFileSync(join(old,'passenger','main.dart.js'),'unchanged passenger');
  const caddy=join(dir,'Caddyfile');writeFileSync(caddy,'{\n admin off\n auto_https off\n}\n:8080 {\n respond /ready 200\n respond /administrodo/* "unchanged admin"\n handle_path /motorista/* {\n root * /srv/web/driver\n file_server\n }\n handle_path /passageiro/* {\n root * /srv/web/passenger\n file_server\n }\n}\n');
  docker(['network','create','--internal',net]);network=true;
  for(const v of volumes){docker(['volume','create',v]);madeVolumes.push(v);}
  const config=join(dir,'gateway.json');
  const plan={name:'ramo-nessa-staging',services:{gateway:{image,container_name:names.gateway,labels:{'br.com.ramonessa.driver-ride-ci':'true'},environment:{LITERAL_SECRET:'fixture-$abc-${UNKNOWN}-$$'},healthcheck:{test:['CMD','wget','-q','-O','/dev/null','http://127.0.0.1:8080/ready'],interval:'1s',timeout:'2s',retries:3},networks:{default:null},volumes:[{type:'bind',source:old,target:'/srv/web',read_only:true},{type:'bind',source:caddy,target:'/etc/caddy/Caddyfile',read_only:true},{type:'volume',source:'data',target:'/data'},{type:'volume',source:'config',target:'/config'}],cap_drop:['ALL'],cap_add:['NET_BIND_SERVICE'],security_opt:['no-new-privileges:true'],read_only:true}},networks:{default:{name:net,external:true}},volumes:{data:{name:volumes[0],external:true},config:{name:volumes[1],external:true}}};
  writeFileSync(config,JSON.stringify(escapeCompose(plan)),{mode:0o600});
  created.push(names.gateway);docker(['compose','-p','ramo-nessa-staging','--env-file','/dev/null','-f',config,'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','30','gateway']);
  for(const role of ['core','postgres','site']){docker(['run','-d','--name',names[role],'--network','none','--env','NODE_ENV=staging','--health-cmd','true','--health-interval','1s','--entrypoint','sh',image,'-c','while true; do sleep 60; done']);created.push(names[role]);}
  for(let n=0;n<15;n++){if(['core','postgres','site'].every(k=>JSON.parse(docker(['inspect',names[k]]))[0].State.Health?.Status==='healthy'))break;await new Promise(r=>setTimeout(r,1000));}
  const fixture={root:join(dir,'private'),release:join(dir,'candidate'),names,origin:'http://127.0.0.1:8080',request:async url=>new Response(docker(['exec',names.gateway,'wget','-q','-O','-',url])),failAfterSwitch,failWithMissingGateway};
  if(shouldFail)await assert.rejects(installDriverRideWeb([archive,checksum],fixture),e=>e.rollbackComplete===true);
  else assert.equal((await installDriverRideWeb([archive,checksum],fixture)).phase,'completed');
  const expectedRoot=shouldFail?old:join(dir,'candidate','bundles');
  const current=JSON.parse(docker(['inspect',names.gateway]))[0];
  assert.equal(current.Mounts.find(m=>m.Destination==='/srv/web').Source,expectedRoot);
  assert.equal(readFileSync(join(old,'driver','main.dart.js'),'utf8'),'old driver retained');
  assert.equal(docker(['exec',names.gateway,'wget','-q','-O','-','http://127.0.0.1:8080/passageiro/main.dart.js']),'unchanged passenger');
  assert.equal(current.Image,image);assert.ok(current.Config.Env.includes('LITERAL_SECRET=fixture-$abc-${UNKNOWN}-$$'));
  console.log('FULL DRIVER RIDE WEB INSTALLER '+scenario.toUpperCase()+' PASSED: actual Caddy, exact ZIP, unchanged passenger/Core/DB/site/image/configuration.');
 }finally{for(const n of created.reverse())docker(['rm','-f',n]);for(const v of madeVolumes)docker(['volume','rm',v]);if(network)docker(['network','rm',net]);rmSync(dir,{recursive:true,force:true});}
}

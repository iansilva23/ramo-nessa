// CI only. Runs the real compiled adapter behind a local HTTP fixture with fake keys.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {activationProject,servicePlan,escapeCompose,environmentMap,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {receiverPlan,assertReceiverRuntime} from './asaas-production-receiver-contract.mjs';
import {switchReceiverCore} from './asaas-receiver-switch-contract.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('CI only.');
const dir=mkdtempSync(join(tmpdir(),'asaas-receiver-switch-')),prefix='asaas-rx-ci-'+randomBytes(6).toString('hex'),core=prefix+'-core',sentinel=prefix+'-unrelated',net=prefix+'-net',volume=prefix+'-documents';
const oldTag=prefix+':before',badTag=prefix+':bad';
function run(command,args,{allowFailure=false}={}){
 const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH}});
 if(allowFailure)return r;
 if(r.error||r.status!==0)throw Error('Disposable receiver CI command failed: '+String(r.stderr));
 return r.stdout;
}
const docker=args=>run('docker',args),inspect=name=>JSON.parse(docker(['inspect',name]))[0];
const image=JSON.parse(docker(['image','inspect','ramo-asaas-ci-new:local']))[0];
const uid=JSON.parse(docker(['run','--rm','--network','none',image.Id,'node','-e','console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid()}))']));
const compose=file=>['compose','--project-name',activationProject,'-f',file];
const fixture=`
import {createServer} from 'node:http';
import {createAsaasWebhookReceiverFromEnv,createDriverPayoutProviderFromEnv} from '/app/dist/src/payments/driver-payout-provider.js';
const forbidden=async()=>{throw Error('unexpected store/finance access');};
const deps={store:{durable:true,begin:forbidden,get:forbidden,attach:forbidden,reject:forbidden,beginEvent:forbidden,completeEvent:forbidden},financeLookup:forbidden};
if(createDriverPayoutProviderFromEnv(process.env,deps)!==null)throw Error('sender unexpectedly configured');
const receiver=createAsaasWebhookReceiverFromEnv(process.env,deps);
createServer(async(req,res)=>{
 res.setHeader('content-type','application/json');
 if(req.url==='/ready'){res.statusCode=process.env.RECEIVER_TEST_HEALTH_FAIL==='true'?500:200;res.end(JSON.stringify({ok:res.statusCode===200}));return;}
 if(req.method==='POST'&&req.url==='/v1/webhooks/asaas/transfers'){
  if(!receiver){res.statusCode=503;res.end(JSON.stringify({error:'ASAAS_NOT_CONFIGURED'}));return;}
  try{let text='';for await(const chunk of req)text+=chunk;await receiver.receiveWebhook(req.headers['asaas-access-token']??'',JSON.parse(text));res.end('{}');}
  catch(error){res.statusCode=error.status??500;res.end(JSON.stringify({error:'INVALID_ASAAS_WEBHOOK'}));}return;
 }
 res.statusCode=404;res.end('{}');
}).listen(8080,'0.0.0.0');
`;
let network=false,vol=false,created=false,other=false;
const built=[];
try{
 mkdirSync(join(dir,'build'));
 for(const [tag,extra]of [[oldTag,'LABEL receiver_test_role="before"'],[badTag,'ENV RECEIVER_TEST_HEALTH_FAIL=true']]){
  writeFileSync(join(dir,'build','Dockerfile'),'FROM ramo-asaas-ci-new:local\n'+extra+'\n');
  docker(['build','--network','none','-t',tag,join(dir,'build')]);built.push(tag);
 }
 const oldImage=JSON.parse(docker(['image','inspect',oldTag]))[0],badImage=JSON.parse(docker(['image','inspect',badTag]))[0];
 assert.notEqual(oldImage.Id,image.Id);
 writeFileSync(join(dir,'fixture.mjs'),fixture,{mode:0o644});
 docker(['network','create','--internal',net]);network=true;docker(['volume','create',volume]);vol=true;
 const initial={name:activationProject,services:{core:{
  image:oldImage.Id,container_name:core,command:['node','/fixture/server.mjs'],
  environment:{NODE_ENV:'test',DRIVER_PAYOUT_PROVIDER_NAME:'asaas',ASAAS_PAYOUTS_ENABLED:'false',LITERAL_SECRET:'fixture-$abc-\${UNKNOWN}-$$'},
  healthcheck:{test:['CMD','node','-e',"fetch('http://127.0.0.1:8080/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],interval:'1s',timeout:'2s',retries:2},
  networks:{default:null},volumes:[{type:'volume',source:'documents',target:'/var/lib/ramo-nessa'},{type:'bind',source:join(dir,'fixture.mjs'),target:'/fixture/server.mjs',read_only:true}],
  read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],
 }},networks:{default:{name:net,external:true}},volumes:{documents:{name:volume,external:true}}};
 const initialFile=join(dir,'initial.json');writeFileSync(initialFile,JSON.stringify(escapeCompose(initial)));
 created=true;docker([...compose(initialFile),'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','15','core']);
 docker(['run','-d','--no-healthcheck','--network','none','--name',sentinel,oldImage.Id,'node','-e','setInterval(()=>{},1000)']);other=true;
 const before=inspect(core),untouchedBefore=inspect(sentinel);
 const resolved=JSON.parse(docker([...compose(initialFile),'config','--format','json']));
 const rollback=servicePlan(resolved,'core',before,oldImage.Id),secretDir=join(dir,'runtime-secrets');
 mkdirSync(secretDir,{mode:0o700});
 for(const [key,value]of Object.entries({'api-key':'fixture-production-key-not-a-real-account','webhook-token':'fixture-production-token-not-a-real-account'})){
  const p=join(secretDir,key);writeFileSync(p,value,{mode:0o600});run('sudo',['chown',uid.uid+':'+uid.gid,p]);
 }
 const candidate=receiverPlan(rollback,image.Id,secretDir),bad=receiverPlan(rollback,badImage.Id,secretDir);
 const models={rollback,receiver:candidate,bad};
 for(const [key,model]of Object.entries(models))writeFileSync(join(dir,key+'.json'),JSON.stringify(model));
 const up=kind=>docker([...compose(join(dir,kind+'.json')),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','10','core']);
 const request=authenticated=>{
  const code="const fs=require('node:fs');const headers={'content-type':'application/json'};"+(authenticated?"headers['asaas-access-token']=fs.readFileSync(process.env.ASAAS_WEBHOOK_TOKEN_FILE,'utf8');":"")+"fetch('http://127.0.0.1:8080/v1/webhooks/asaas/transfers',{method:'POST',headers,body:'{}'}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()})))";
  return JSON.parse(docker(['exec',core,'node','-e',code]));
 };
 const untouched=()=>{const c=inspect(sentinel);assert.equal(c.Id,untouchedBefore.Id);assert.equal(c.State.StartedAt,untouchedBefore.State.StartedAt);};
 const verifyRollback=async()=>{
  const c=inspect(core);assert.equal(c.Image,oldImage.Id);assert.equal(c.State.Health.Status,'healthy');assertEnvironmentMatches(rollback.services.core,c,oldImage);
  assert.deepEqual(c.Mounts.map(m=>[m.Type,m.Source,m.Destination,m.RW]).sort(),before.Mounts.map(m=>[m.Type,m.Source,m.Destination,m.RW]).sort());assert.equal(request(false).status,503);untouched();
 };
 assert.equal(request(false).status,503);
 await switchReceiverCore({
  up:async()=>{up('receiver');},
  check:async()=>{assert.equal(request(false).status,401);assert.equal(request(true).status,400);},
  verify:async()=>{const c=inspect(core);assert.equal(c.Image,image.Id);assertReceiverRuntime(environmentMap(c.Config.Env));assertEnvironmentMatches(candidate.services.core,c,image);assert.equal(environmentMap(c.Config.Env).LITERAL_SECRET,'fixture-$abc-\${UNKNOWN}-$$');assert.equal(c.Mounts.length,before.Mounts.length+2);assert.ok(c.Mounts.filter(m=>m.Destination.includes('asaas')).every(m=>m.RW===false));untouched();},
  rollback:async()=>{up('rollback');},verifyRollback,
 });
 up('rollback');await verifyRollback();
 await assert.rejects(switchReceiverCore({up:async()=>{up('bad');},check:async()=>{},verify:async()=>{},rollback:async()=>{up('rollback');},verifyRollback}),e=>e.rollbackComplete===true);
 await verifyRollback();
 console.log('PRODUCTION RECEIVER SWITCH CI PASSED: actual compiled adapter gives 401/400 with sender null; healthy Core-only image switch preserves literal secrets and private read-only mounts; failed health restores old image/environment/mounts; unrelated container unchanged. Fake credentials, internal network, no real transfer.');
}finally{
 if(created)docker(['rm','-f',core]);if(other)docker(['rm','-f',sentinel]);
 if(vol)docker(['volume','rm',volume]);if(network)docker(['network','rm',net]);
 for(const tag of built)docker(['image','rm',tag]);
 run('sudo',['rm','-rf','--',dir]);
}

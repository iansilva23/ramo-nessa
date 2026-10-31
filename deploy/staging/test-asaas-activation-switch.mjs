// CI-only running Compose rehearsal of the same switch/rollback state machine.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {activationProject,servicePlan,escapeCompose,environmentMap} from './asaas-activation-plan-contract.mjs';
import {switchDisabledRuntime} from './asaas-disabled-activation-contract.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('CI only.');
const dir=mkdtempSync(join(tmpdir(),'asaas-switch-')),prefix='asaas-switch-ci-'+randomBytes(8).toString('hex'),network=prefix+'-net';
const volumes=['core-data','core-config','gateway-data','gateway-config'].map(x=>prefix+'-'+x),core=prefix+'-core',gateway=prefix+'-gateway',sentinel=prefix+'-sentinel';
const run=(args,options={})=>{const r=spawnSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024,env:{PATH:process.env.PATH},...options});if(r.status!==0)throw Error('Disposable switch CI step failed: '+r.stderr);return r.stdout;};
const inspect=name=>JSON.parse(run(['inspect',name]))[0],ownedVolumes=[],images=[];let net=false,created=false,sentinelCreated=false;
const header='{\n admin off\n auto_https off\n}\n';
async function pollBody(value){for(let n=0;n<20;n++){try{if(run(['exec',gateway,'wget','-q','-O','-','http://127.0.0.1:8080/version']).trim()===value)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Gateway did not serve '+value);}
try{
 run(['network','create',network]);net=true;for(const volume of volumes){run(['volume','create',volume]);ownedVolumes.push(volume);}
 for(const [name,config] of [
  ['core-before',header+':8080 {\n respond /ready 200\n respond /version "before"\n respond 404\n}\n'],
  ['core-after',header+':8080 {\n respond /ready 200\n respond /version "after"\n respond 404\n}\n'],
  ['gateway-before',header+':8080 {\n respond /healthz 200\n reverse_proxy core:8080\n}\n'],
  ['gateway-after',header+':8080 {\n respond /healthz 200\n header X-CI-Revision after\n reverse_proxy core:8080\n}\n'],
  ['gateway-broken',header+':8080 {\n respond /healthz 500\n reverse_proxy core:8080\n}\n']]){
  const path=join(dir,name);mkdirSync(path);writeFileSync(join(path,'Caddyfile'),config);writeFileSync(join(path,'Dockerfile'),'FROM caddy:2.11.7-alpine\nCOPY Caddyfile /etc/caddy/Caddyfile\nLABEL ci.variant="'+name+'"\n');
  const tag=prefix+':'+name;run(['build','-q','-t',tag,path]);images.push(tag);
 }
 const environment={NODE_ENV:'staging',MERCADO_PAGO_MODE:'test',DRIVER_PAYOUT_PROVIDER_NAME:'',PRIVATE_FIXTURE:'$literal-${REFERENCE}-$$'};
 const initial={name:activationProject,services:{},networks:{default:{name:network,external:true}},volumes:{}};
 for(const [name,container,readyPath,index] of [['core',core,'/ready',0],['gateway',gateway,'/healthz',2]]){
  initial.services[name]={image:prefix+':'+name+'-before',container_name:container,environment:name==='core'?environment:{APP_DOMAIN:'example.invalid'},networks:{default:{aliases:[name]}},volumes:[{type:'volume',source:name+'_data',target:'/data'},{type:'volume',source:name+'_config',target:'/config'}],healthcheck:{test:['CMD-SHELL','wget -q -O /dev/null http://127.0.0.1:8080'+readyPath+' || exit 1'],interval:'1s',timeout:'1s',start_period:'1s',retries:1}};
  initial.volumes[name+'_data']={name:volumes[index],external:true};initial.volumes[name+'_config']={name:volumes[index+1],external:true};
 }
 const beforeFile=join(dir,'before.json');writeFileSync(beforeFile,JSON.stringify(escapeCompose(initial)));
 const compose=file=>['compose','--project-name',activationProject,'-f',file];
 const upArgs=['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','10'];
 created=true;run([...compose(beforeFile),...upArgs,'core','gateway']);
 run(['run','-d','--name',sentinel,'--network','none',prefix+':gateway-before']);sentinelCreated=true;const sentinelBefore=inspect(sentinel);
 const baseline={core:inspect(core),gateway:inspect(gateway)},resolved=JSON.parse(run([...compose(beforeFile),'config','--format','json']));
 const modelFiles={};
 for(const name of ['core','gateway'])for(const kind of ['candidate','rollback','broken']){
  if(name==='core'&&kind==='broken')continue;
  const tag=prefix+':'+name+'-'+(kind==='rollback'?'before':kind==='broken'?'broken':'after');
  const model=servicePlan(resolved,name,baseline[name],tag,{disabledAsaas:name==='core'&&kind==='candidate'}),file=join(dir,name+'-'+kind+'.json');writeFileSync(file,JSON.stringify(model));modelFiles[name+'-'+kind]=file;
 }
 const untouched=()=>{const s=inspect(sentinel);assert.equal(s.Id,sentinelBefore.Id);assert.equal(s.State.StartedAt,sentinelBefore.State.StartedAt);};
 const mountShape=name=>inspect(name).Mounts.map(m=>[m.Name,m.Destination]).sort();const mountsBefore={core:mountShape(core),gateway:mountShape(gateway)};
 const up=(name,kind)=>run([...compose(modelFiles[name+'-'+kind]),...upArgs,name]);
 const beforeVersion=async()=>{await pollBody('before');for(const name of ['core','gateway'])assert.equal(inspect(name==='core'?core:gateway).Image,baseline[name].Image);untouched();};
 const candidateCore=()=>{const env=environmentMap(inspect(core).Config.Env);assert.equal(env.ASAAS_PAYOUTS_ENABLED,'false');assert.equal(env.DRIVER_PAYOUT_PROVIDER_NAME,'asaas');assert.equal(env.MERCADO_PAGO_MODE,'test');assert.equal(env.PRIVATE_FIXTURE,'$literal-${REFERENCE}-$$');};
 const actions=broken=>({migrate:async()=>{},upCore:async()=>up('core','candidate'),checkCore:async()=>{candidateCore();untouched();},upGateway:async()=>up('gateway',broken?'broken':'candidate'),checkGateway:async()=>{await pollBody('after');untouched();},verify:async()=>{assert.deepEqual(mountShape(core),mountsBefore.core);assert.deepEqual(mountShape(gateway),mountsBefore.gateway);},rollbackCore:async()=>up('core','rollback'),rollbackGateway:async()=>up('gateway','rollback'),verifyRollback:beforeVersion});
 await switchDisabledRuntime(actions(false));await pollBody('after');candidateCore();untouched();
 up('core','rollback');up('gateway','rollback');await beforeVersion();
 await assert.rejects(switchDisabledRuntime(actions(true)),e=>e.rollbackComplete===true);
 await beforeVersion();assert.deepEqual(mountShape(core),mountsBefore.core);assert.deepEqual(mountShape(gateway),mountsBefore.gateway);
 console.log('DISABLED ACTIVATION SWITCH CI PASSED: healthy Core/gateway upgrade, Asaas false, literal secret preserved, failed gateway health rolls back both images, external volumes and unrelated container unchanged. No real migration/account used in this switch rehearsal.');
}finally{
 if(created)for(const name of [gateway,core]){const r=spawnSync('docker',['inspect',name],{stdio:'ignore'});if(r.status===0)run(['rm','-f','-v',name]);}
 if(sentinelCreated)run(['rm','-f','-v',sentinel]);for(const volume of ownedVolumes)run(['volume','rm',volume]);if(net)run(['network','rm',network]);for(const image of images)run(['image','rm',image]);rmSync(dir,{recursive:true,force:true});
}

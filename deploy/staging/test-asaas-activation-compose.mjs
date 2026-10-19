// CI-only stopped containers: prove resolved Compose re-input preserves secrets and resources.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {activationProject,servicePlan,escapeCompose,assertEnvironmentMatches,environmentMap} from './asaas-activation-plan-contract.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('CI only.');
const dir=mkdtempSync(join(tmpdir(),'asaas-plan-ci-')),prefix='asaas-plan-ci-'+randomBytes(8).toString('hex'),network=prefix+'-net',volumes=[prefix+'-data',prefix+'-config'];
const image='caddy:2.11.7-alpine',container='ramo-nessa-staging-core-1';
const run=args=>{const r=spawnSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024,env:{PATH:process.env.PATH}});if(r.status!==0)throw Error('Disposable plan CI command failed: '+r.stderr);return r.stdout;};
let net=false,created=false;const owned=[];
try{
 run(['network','create',network]);net=true;for(const v of volumes){run(['volume','create',v]);owned.push(v);}
 writeFileSync(join(dir,'firebase-fixture.json'),'{}');
 const initial={name:activationProject,services:{core:{image,command:['caddy','version'],environment:{NODE_ENV:'staging',MERCADO_PAGO_MODE:'test',PUSH_PROVIDER:'fcm',GOOGLE_MAPS_SERVER_API_KEY:'fixture-$abc-${SOMETHING}-$1-$$',DRIVER_PAYOUT_PROVIDER_NAME:''},volumes:[{type:'volume',source:'data',target:'/data'},{type:'volume',source:'config',target:'/config'},{type:'bind',source:join(dir,'firebase-fixture.json'),target:'/run/secrets/firebase',read_only:true}],networks:{default:null},cap_drop:['ALL'],security_opt:['no-new-privileges:true']}},networks:{default:{name:network,external:true}},volumes:{data:{name:volumes[0],external:true},config:{name:volumes[1],external:true}}};
 const beforeFile=join(dir,'before.json');writeFileSync(beforeFile,JSON.stringify(escapeCompose(initial)));
 const compose=file=>['compose','--project-name',activationProject,'-f',file];
 run([...compose(beforeFile),'create','--no-build','--pull','never','core']);created=true;
 const before=JSON.parse(run(['inspect',container]))[0],imageInfo=JSON.parse(run(['image','inspect',image]))[0];
 const resolved=JSON.parse(run([...compose(beforeFile),'config','--format','json']));assertEnvironmentMatches(resolved.services.core,before,imageInfo);
 const candidate=servicePlan(resolved,'core',before,image,{disabledAsaas:true}),rollback=servicePlan(resolved,'core',before,image);
 const sourceMounts=before.Mounts.map(x=>[x.Type,x.Source,x.Destination,x.RW]).sort();
 for(const [name,model] of [['candidate',candidate],['rollback',rollback]]){
  const file=join(dir,name+'.json');writeFileSync(file,JSON.stringify(escapeCompose(model)));
  const parsed=JSON.parse(run([...compose(file),'config','--format','json']));assert.deepEqual(parsed.services.core.environment,model.services.core.environment);
  run([...compose(file),'create','--force-recreate','--no-build','--pull','never','core']);
  const actual=JSON.parse(run(['inspect',container]))[0],env=environmentMap(actual.Config.Env);
  for(const [k,v] of Object.entries(model.services.core.environment))assert.equal(env[k],v);
  assert.deepEqual(actual.Mounts.map(x=>[x.Type,x.Source,x.Destination,x.RW]).sort(),sourceMounts);
  assert.equal(actual.State.Running,false);assert.equal(actual.Image,before.Image);
 }
 console.log('ACTIVATION PLAN COMPOSE CI PASSED: literal dollar secrets preserved, external network/volumes unchanged, disabled candidate and exact rollback environment verified using stopped containers.');
}finally{if(created)run(['rm','-f',container]);for(const v of owned)run(['volume','rm',v]);if(net)run(['network','rm',network]);rmSync(dir,{recursive:true,force:true});}

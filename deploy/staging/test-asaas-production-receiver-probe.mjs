// CI only: fake credentials, stopped Compose containers, and an offline private probe.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {activationProject,servicePlan,escapeCompose,assertEnvironmentMatches,environmentMap} from './asaas-activation-plan-contract.mjs';
import {receiverPlan,receiverEnvironment,receiverSecretTargets,receiverProbeSource,assertReceiverRuntime} from './asaas-production-receiver-contract.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('CI only.');
const dir=mkdtempSync(join(tmpdir(),'asaas-receiver-ci-')),prefix='asaas-receiver-ci-'+randomBytes(8).toString('hex');
const net=prefix+'-net',volume=prefix+'-data',name='ramo-nessa-staging-core-1';
function run(command,args,{failure=false}={}){
 const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH}});
 if(!failure&&(r.error||r.status!==0))throw Error('CI command failed: '+String(r.stderr));
 return failure?r:r.stdout;
}
const docker=args=>run('docker',args);
const image=JSON.parse(docker(['image','inspect','ramo-asaas-ci-new:local']))[0];
const uid=JSON.parse(docker(['run','--rm','--network','none',image.Id,'node','-e','console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid()}))']));
const compose=file=>['compose','--project-name',activationProject,'-f',file];
let created=false,network=false,vol=false;
try {
 docker(['network','create',net]);network=true;docker(['volume','create',volume]);vol=true;
 const initial={name:activationProject,services:{core:{image:image.Id,command:['node','-e','process.exit(0)'],environment:{DRIVER_PAYOUT_PROVIDER_NAME:'asaas',ASAAS_PAYOUTS_ENABLED:'false',NODE_ENV:'staging',MERCADO_PAGO_MODE:'test',LITERAL_SECRET:'fixture-$abc-\${UNKNOWN}-$$'},networks:{default:null},volumes:[{type:'volume',source:'documents',target:'/var/lib/ramo-nessa'}],read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true']}},networks:{default:{name:net,external:true}},volumes:{documents:{name:volume,external:true}}};
 const beforeFile=join(dir,'before.json');writeFileSync(beforeFile,JSON.stringify(escapeCompose(initial)));
 docker([...compose(beforeFile),'create','--no-build','--pull','never','core']);created=true;
 const before=JSON.parse(docker(['inspect',name]))[0];
 const resolved=JSON.parse(docker([...compose(beforeFile),'config','--format','json']));
 assertEnvironmentMatches(resolved.services.core,before,image);
 const rollback=servicePlan(resolved,'core',before,image.Id),secrets=join(dir,'runtime-secrets');
 mkdirSync(secrets,{mode:0o700});
 const fixtureSecrets={'api-key':'fixture-production-api-key-not-an-account','webhook-token':'fixture-production-webhook-token-not-an-account'};
 for(const [key,value]of Object.entries(fixtureSecrets)){
  writeFileSync(join(secrets,key),value,{mode:0o600});
  run('sudo',['chown',uid.uid+':'+uid.gid,join(secrets,key)]);
 }
 const candidate=receiverPlan(rollback,image.Id,secrets);
 const candidateFile=join(dir,'candidate.json');writeFileSync(candidateFile,JSON.stringify(candidate));
 docker([...compose(candidateFile),'create','--force-recreate','--no-build','--pull','never','core']);
 const actual=JSON.parse(docker(['inspect',name]))[0];
 assert.equal(actual.State.Running,false);assertEnvironmentMatches(candidate.services.core,actual,image);
 const env=environmentMap(actual.Config.Env);assertReceiverRuntime(env);
 assert.equal(env.LITERAL_SECRET,'fixture-$abc-\${UNKNOWN}-$$');
 assert.equal(actual.Mounts.length,before.Mounts.length+2);
 for(const [key,target]of Object.entries(receiverSecretTargets)){
  const m=actual.Mounts.find(x=>x.Destination===target);
  assert.equal(m.Source,join(secrets,key));assert.equal(m.RW,false);
 }
 const probe=['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges'];
 for(const [key,value]of Object.entries(receiverEnvironment))probe.push('--env',key+'='+value);
 for(const [key,target]of Object.entries(receiverSecretTargets))probe.push('--mount','type=bind,src='+join(secrets,key)+',dst='+target+',readonly');
 probe.push(image.Id,'node','--input-type=module','-e',receiverProbeSource);
 assert.equal(docker(probe).trim(),'RECEIVER_PRIVATE_PROBE_OK');
 run('sudo',['chmod','0644',join(secrets,'api-key')]);
 const open=run('docker',probe,{failure:true});assert.notEqual(open.status,0);assert.match(open.stderr,/RECEIVER_PRIVATE_PROBE_FAILED/);
 for(const secret of Object.values(fixtureSecrets))assert.ok(!String(open.stdout+open.stderr).includes(secret));
 run('sudo',['chmod','0600',join(secrets,'api-key')]);
 run('sudo',['chown','0:0',join(secrets,'api-key')]);
 assert.notEqual(run('docker',probe,{failure:true}).status,0);
 run('sudo',['chown',uid.uid+':'+uid.gid,join(secrets,'api-key')]);
 const rollbackFile=join(dir,'rollback.json');writeFileSync(rollbackFile,JSON.stringify(rollback));
 docker([...compose(rollbackFile),'create','--force-recreate','--no-build','--pull','never','core']);
 const restored=JSON.parse(docker(['inspect',name]))[0];
 assertEnvironmentMatches(rollback.services.core,restored,image);
 assert.deepEqual(restored.Mounts.map(m=>[m.Type,m.Source,m.Destination,m.RW]),before.Mounts.map(m=>[m.Type,m.Source,m.Destination,m.RW]));
 assert.equal(restored.State.Running,false);
 console.log('PRODUCTION RECEIVER PREPARATION CI PASSED: node reads private 0600 binds offline; sender null; direct submission blocked; wrong ownership/open permissions refused; Compose preserves literal secrets, volumes and exact rollback. No real account or running service used.');
}finally{
 if(created)docker(['rm','-f',name]);
 if(vol)docker(['volume','rm',volume]);
 if(network)docker(['network','rm',net]);
 // Files are owned by container uid; remove only this newly created CI directory.
 run('sudo',['rm','-rf','--',dir]);
}

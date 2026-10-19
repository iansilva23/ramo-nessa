// CI only: real Caddy container, immutable image, fake static apps and no Asaas.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {activationProject,servicePlan,escapeCompose,sha256,environmentMap} from './asaas-activation-plan-contract.mjs';
import {gatewayWebPlan,assertGatewayWebDelta} from './asaas-driver-web-contract.mjs';
import {switchDriverWeb,assertWebGatewayRuntime} from './asaas-driver-web-switch-contract.mjs';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('CI only.');
const dir=mkdtempSync(join(tmpdir(),'driver-web-ci-')),prefix='driver-web-ci-'+randomBytes(5).toString('hex'),gateway=prefix+'-gateway',sentinel=prefix+'-unrelated',net=prefix+'-net';
const volumes=[prefix+'-data',prefix+'-config'];
let created=false,other=false,network=false;const madeVolumes=[];
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:8*1024*1024});if(r.error||r.status!==0){const logs=spawnSync('docker',['logs',gateway],{encoding:'utf8'});throw Error('Disposable Web CI: '+r.stderr+'\nGateway logs: '+logs.stdout+logs.stderr);}return r.stdout;}
const inspect=n=>JSON.parse(docker(['inspect',n]))[0];
const compose=p=>['compose','--project-name',activationProject,'-f',p];
try{
 const image=JSON.parse(docker(['image','inspect','caddy:2.11.7-alpine']))[0];
 for(const version of ['old','new'])for(const role of ['passenger','driver']){
  const path=join(dir,version,role);mkdirSync(path,{recursive:true,mode:0o755});
  writeFileSync(join(path,'index.html'),role==='passenger'?'unchanged passenger':'driver '+version,{mode:0o644});
 }
 writeFileSync(join(dir,'Caddyfile'),'{\n admin off\n auto_https off\n}\n:8080 {\n respond /healthz 200\n handle_path /motorista/* {\n root * /srv/web/driver\n file_server\n }\n handle_path /passageiro/* {\n root * /srv/web/passenger\n file_server\n }\n}\n',{mode:0o644});
 docker(['network','create','--internal',net]);network=true;
 for(const v of volumes){docker(['volume','create',v]);madeVolumes.push(v);}
 const initial={name:activationProject,services:{gateway:{image:image.Id,container_name:gateway,environment:{LITERAL_SECRET:'fixture-$abc-${UNKNOWN}-$$'},
  healthcheck:{test:['CMD','wget','-q','-O','/dev/null','http://127.0.0.1:8080/healthz'],interval:'1s',timeout:'2s',retries:3},
  networks:{default:null},volumes:[{type:'bind',source:join(dir,'old'),target:'/srv/web',read_only:true},{type:'bind',source:join(dir,'Caddyfile'),target:'/etc/caddy/Caddyfile',read_only:true},{type:'volume',source:'data',target:'/data'},{type:'volume',source:'config',target:'/config'}],
  cap_drop:['ALL'],cap_add:['NET_BIND_SERVICE'],security_opt:['no-new-privileges:true'],read_only:true,
 }},networks:{default:{name:net,external:true}},volumes:{data:{name:volumes[0],external:true},config:{name:volumes[1],external:true}}};
 const path=join(dir,'initial.json');writeFileSync(path,JSON.stringify(escapeCompose(initial)));
 created=true;docker([...compose(path),'up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','20','gateway']);
 docker(['run','-d','--name',sentinel,'--network','none','--entrypoint','sh',image.Id,'-c','while true; do sleep 60; done']);other=true;
 const before=inspect(gateway),untouchedBefore=inspect(sentinel),caddyHash=sha256(readFileSync(join(dir,'Caddyfile')));
 const model=JSON.parse(docker([...compose(path),'config','--format','json']));
 const rollback=servicePlan(model,'gateway',before,image.Id),candidate=gatewayWebPlan(rollback,join(dir,'new'));
 assertGatewayWebDelta(rollback,candidate,join(dir,'new'));
 for(const [k,m]of Object.entries({rollback,candidate}))writeFileSync(join(dir,k+'.json'),JSON.stringify(m));
 const up=k=>docker([...compose(join(dir,k+'.json')),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','20','gateway']);
 const content=role=>docker(['exec',gateway,'wget','-q','-O','-','http://127.0.0.1:8080/'+(role==='driver'?'motorista':'passageiro')+'/']);
 const untouched=()=>{const c=inspect(sentinel);assert.equal(c.Id,untouchedBefore.Id);assert.equal(c.State.StartedAt,untouchedBefore.State.StartedAt);assert.equal(sha256(readFileSync(join(dir,'Caddyfile'))),caddyHash);assert.equal(readFileSync(join(dir,'old','driver','index.html'),'utf8'),'driver old');};
 const verify=k=>{assertWebGatewayRuntime(before,inspect(gateway),k==='candidate'?candidate:rollback,image,join(dir,k==='candidate'?'new':'old'));assert.equal(content('driver'),k==='candidate'?'driver new':'driver old');assert.equal(content('passenger'),'unchanged passenger');assert.equal(environmentMap(inspect(gateway).Config.Env).LITERAL_SECRET,'fixture-$abc-${UNKNOWN}-$$');untouched();};
 await switchDriverWeb({up:async()=>{up('candidate');},check:async()=>{assert.equal(content('driver'),'driver new');},verify:async()=>verify('candidate'),rollback:async()=>{up('rollback');},verifyRollback:async()=>verify('rollback')});
 up('rollback');verify('rollback');
 await assert.rejects(switchDriverWeb({up:async()=>{up('candidate');},check:async()=>{assert.equal(content('driver'),'driver new');throw Error('forced public verification failure');},verify:async()=>{},rollback:async()=>{up('rollback');},verifyRollback:async()=>verify('rollback')}),e=>e.rollbackComplete===true);
 verify('rollback');
 console.log('DRIVER WEB SWITCH CI PASSED: actual Caddy serves new driver and identical passenger; same image, literal environment, volumes and Caddy; failed public check restores previous mount; unrelated container unchanged. No financial service or account accessed.');
}finally{
 if(created)docker(['rm','-f',gateway]);if(other)docker(['rm','-f',sentinel]);for(const v of madeVolumes)docker(['volume','rm',v]);if(network)docker(['network','rm',net]);
 rmSync(dir,{recursive:true,force:true});
}

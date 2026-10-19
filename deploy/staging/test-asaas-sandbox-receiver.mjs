// CI-only real compiled provider/ledger over HTTP, with a fake Asaas GET transport.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync,copyFileSync,chmodSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
export async function testSandboxReceiver({dir,lab,sourceContainer,candidate,postgres,user,password,session,result}){
 if(process.env.GITHUB_ACTIONS!=='true')throw Error('CI only.');
 const prefix='ramo-asaas-sandbox-'+session.id.replaceAll('-',''),db=prefix+'-db',receiver=prefix+'-receiver',network=prefix+'-http-ci';
 const run=(args,options={})=>{const r=spawnSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024,...options});if(r.status!==0||r.error)throw Error('Receiver CI command failed: '+r.stderr);return r.stdout;};
 let net=false,pg=false,http=false;
 try{
  const dump=run(['exec',sourceContainer,'pg_dump','--no-owner','--no-acl','-U',user,'-d','ramo_asaas_sandbox']);
  run(['network','create',network]);net=true;
  run(['run','-d','--name',db,'--network',network,'--env','POSTGRES_USER='+user,'--env','POSTGRES_PASSWORD='+password,'--env','POSTGRES_DB=ramo_asaas_sandbox',postgres]);pg=true;
  let ready=false;for(let i=0;i<30;i++){const r=spawnSync('docker',['exec',db,'sh','-lc','test "$(cat /proc/1/comm)" = "postgres" && psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "SELECT 1"'],{encoding:'utf8'});if(r.status===0&&r.stdout.trim()==='1'){ready=true;break;}await new Promise(r=>setTimeout(r,1000));}assert.ok(ready);
  run(['exec','-i',db,'psql','-v','ON_ERROR_STOP=1','-U',user,'-d','ramo_asaas_sandbox'],{input:dump});
  const modules=['asaas-sandbox-webhook-http.mjs','asaas-sandbox-webhook-receiver.mjs'];
  for(const file of modules){copyFileSync(resolve('deploy/staging',file),join(dir,file));chmodSync(join(dir,file),0o644);}
  writeFileSync(join(dir,'receiver-fixture.mjs'),`import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';globalThis.fetch=async(input,init={})=>{assert.equal(new URL(input).origin,'https://api-sandbox.asaas.com');assert.equal(init.method??'GET','GET');return Response.json(JSON.parse(readFileSync('/audit/data/remote-fixture.json','utf8')));};await import('/audit/asaas-sandbox-webhook-receiver.mjs');`,{mode:0o644});
  run(['run','-d','--name',receiver,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--env','DB_SSL=false','--env','DATABASE_URL=postgresql://'+user+':'+password+'@'+db+':5432/ramo_asaas_sandbox','--mount','type=bind,src='+lab+',dst=/audit/data',
   ...[...modules,'receiver-fixture.mjs'].flatMap(file=>['--mount','type=bind,src='+join(dir,file)+',dst=/audit/'+file+',readonly']),
   '--mount','type=bind,src='+join(dir,'key-fixture')+',dst=/run/secrets/asaas-sandbox-api-key,readonly',candidate,'node','/audit/receiver-fixture.mjs']);http=true;
  let healthy=false;for(let i=0;i<20;i++){try{run(['exec',receiver,'node','--input-type=module','-e',"if((await fetch('http://127.0.0.1:8080/healthz')).status!==200)process.exit(1)"]);healthy=true;break;}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(healthy);
  const send=(token,body)=>Number(run(['exec',receiver,'node','--input-type=module','-e',`const r=await fetch('http://127.0.0.1:8080/__asaas_sandbox/transfers',{method:'POST',headers:{'content-type':'application/json','asaas-access-token':${JSON.stringify(token)}},body:${JSON.stringify(JSON.stringify(body))}});console.log(r.status);`]));
  const token=readFileSync(join(lab,'webhook-token'),'utf8'),body={id:'evt-incoming-ci-'+session.id,event:'TRANSFER_DONE',transfer:{id:result.transferId}};
  assert.equal(send('invalid-token',body),401);assert.equal(send(token,body),200);assert.equal(send(token,body),200);
  assert.equal(run(['exec',db,'psql','-U',user,'-d','ramo_asaas_sandbox','-Atq','-c',"SELECT count(*) FROM ledger_transactions WHERE reference_key='driver-payout-paid:"+result.payoutId+"'"]).trim(),'1');
  const receipts=readFileSync(join(lab,'webhook-receipts.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(receipts.length,2);assert.equal(receipts[0].localProbe,false);assert.equal(receipts[1].duplicate,true);
  assert.equal(readFileSync(join(lab,'http-intents.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse).filter(x=>x.method==='POST').length,1);
  console.log('SANDBOX RECEIVER CI PASSED: HTTP authentication, canonical GET, duplicate delivery, durable one-entry ledger. Transport is a fixture; external Asaas delivery remains untested.');
 }finally{if(http)run(['rm','-f',receiver]);if(pg)run(['rm','-f','-v',db]);if(net)run(['network','rm',network]);}
}

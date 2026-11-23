// One additional fictitious Sandbox payout, in a persistent new session. Never resets the first.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,chownSync,chmodSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeContract,validateRuntime,activeCaddy,ensureSandboxDataDirectory} from './asaas-runtime-contract.mjs';
import {newWebhookExercise,validateExercise,validateSandboxRegistration,webhookEvidence} from './asaas-webhook-exercise-contract.mjs';
if(process.getuid?.()!==0)throw Error('Execute com sudo.');process.umask(0o077);
const root='/var/lib/ramo-nessa-asaas-sandbox',phase=join(root,'webhook-exercise'),originalData=join(root,'data'),backup='/var/backups/ramo-nessa-asaas/5ffae7968796';
function privateDir(path){const x=lstatSync(path);if(!x.isDirectory()||x.isSymbolicLink()||x.uid!==0||(x.mode&0o077))throw Error('Diretório privado divergente.');}
privateDir(root);
const lock=join(root,'execution.lock');closeSync(openSync(lock,'wx',0o600));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
function run(args,options={}){const r=spawnSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024,...options});if(r.error||r.status!==0){writeFileSync(join(root,'webhook-exercise-last.private.log'),String(r.stderr??'')+String(r.stdout??''),{mode:0o600});throw Error('Etapa Docker não concluída; sessão preservada. Não crie outra transferência manualmente.');}return r.stdout;}
const inspect=name=>JSON.parse(run(['inspect',name]))[0];
const snapshot=()=>Object.fromEntries(Object.entries(runtimeContract).map(([k,v])=>[k,inspect(v.name)]));
try{
 const start=snapshot();validateRuntime(start);
 const original=json(join(root,'session.private.json')),prepared=json(join(backup,'prepared.json')),journal=json(join(root,'public-webhook/state.private.json'));
 if(original.revision!=='5ffae79687965042765f40f53cd32e57510dfbfe'||prepared.revision!==original.revision||!/^[a-f0-9-]{36}$/.test(original.id)||!/^[-_A-Za-z0-9]{40,60}$/.test(original.password))throw Error('Preparação original divergente.');
 if(journal.phase!=='ready'||journal.sessionId!==original.id||journal.candidateHash!==hash(readFileSync(activeCaddy)))throw Error('A rota de testes mudou ou não está pronta.');
 const prefix='ramo-asaas-sandbox-'+original.id.replaceAll('-',''),db=prefix+'-db',receiver=prefix+'-receiver',pg=inspect(db),http=inspect(receiver),label='br.com.ramonessa.asaas-sandbox';
 if(!pg.State.Running||!http.State.Running||pg.Config.Labels?.[label]!==original.id||http.Config.Labels?.[label]!==original.id||pg.Image!==start.postgres.Image||http.Image!==prepared.coreCandidate||journal.receiver!==receiver)throw Error('Banco/receptor Sandbox não estão na sessão esperada.');
 if(pg.HostConfig.NetworkMode!==prefix+'-net'||Object.keys(pg.HostConfig.PortBindings??{}).length||Object.keys(pg.NetworkSettings.Networks).some(x=>x!==prefix+'-net')||!pg.Mounts.some(x=>x.Name===prefix+'-data'&&x.Destination==='/var/lib/postgresql/data'))throw Error('Isolamento do banco de testes divergente.');
 if(JSON.parse(run(['image','inspect',prepared.coreImage]))[0].Id!==prepared.coreCandidate)throw Error('Imagem candidata mudou.');
 run(['exec',receiver,'node','--input-type=module','-e',"if((await fetch('http://127.0.0.1:8080/healthz')).status!==200)process.exit(1)"]);
 const keyFile='/opt/ramo-nessa-private/asaas-sandbox/api-key',tokenFile=join(originalData,'webhook-token');
 for(const file of [keyFile,tokenFile]){const x=lstatSync(file);if(!x.isFile()||x.isSymbolicLink()||x.uid!==1000||(x.mode&0o077))throw Error('Credencial Sandbox com permissões inesperadas.');}
 const token=readFileSync(tokenFile,'utf8').trim();
 console.log('Conferindo cadastro do webhook no Sandbox, sem alterar suas configurações...');
 const response=await fetch('https://api-sandbox.asaas.com/v3/webhooks?limit=100&offset=0',{headers:{access_token:readFileSync(keyFile,'utf8').trim(),'user-agent':'RamoNessa-DriverPayouts/1.0'},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Consulta de webhooks recusada. HTTP '+response.status+'. Nenhum novo envio foi iniciado.');
 const registered=await response.json();if(registered.hasMore)throw Error('Lista de webhooks incompleta. Nenhum envio iniciado.');validateSandboxRegistration(registered.data,token);
 const oldFiles=['session.json','result.json','http-intents.jsonl'].map(n=>join(originalData,n)),before=oldFiles.map(p=>hash(readFileSync(p)));
 const first=json(join(originalData,'result.json'));if(first.result!=='passed'||first.postAttempts!==1||first.status!=='paid')throw Error('O primeiro teste não está no estado aprovado.');
 if(!existsSync(phase))mkdirSync(phase,{mode:0o700});privateDir(phase);
 const data=join(phase,'data');ensureSandboxDataDirectory(data);
 const stateFile=join(data,'session.json');let s;
 if(existsSync(stateFile))s=json(stateFile);
 else {s=newWebhookExercise(original.id);writeFileSync(stateFile,JSON.stringify(s),{mode:0o600,flag:'wx'});chownSync(stateFile,1000,1000);}
 validateExercise(s,original.id);
 const exerciseToken=join(data,'webhook-token');
 if(!existsSync(exerciseToken)){writeFileSync(exerciseToken,token,{mode:0o600,flag:'wx'});chownSync(exerciseToken,1000,1000);}
 if(readFileSync(exerciseToken,'utf8')!==token)throw Error('Token do segundo teste divergente.');
 const worker=join(phase,'worker.mjs');const workerBytes=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'asaas-sandbox-worker.mjs'));
 if(existsSync(worker)){if(!readFileSync(worker).equals(workerBytes))throw Error('Worker da sessão mudou; confira antes de continuar.');}
 else{writeFileSync(worker,workerBytes,{mode:0o644,flag:'wx'});chmodSync(worker,0o644);}
 const dbUrl='postgresql://ramo_sandbox:'+original.password+'@127.0.0.1:5432/ramo_asaas_sandbox';
 console.log('Segundo teste Sandbox de R$5. Repetir este comando consulta a mesma sessão; não cria outro repasse.');
 run(['run','--rm','--name',prefix+'-webhook-worker','--network','container:'+db,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--env','DATABASE_URL='+dbUrl,'--env','DB_SSL=false','--mount','type=bind,src='+data+',dst=/audit/data','--mount','type=bind,src='+worker+',dst=/audit/worker.mjs,readonly','--mount','type=bind,src='+keyFile+',dst=/run/secrets/asaas-sandbox-api-key,readonly',prepared.coreCandidate,'node','/audit/worker.mjs']);
 const result=json(join(data,'result.json'));if(result.transport!=='asaas-sandbox-api'||result.postAttempts!==1||!/^[a-f0-9-]{36}$/.test(result.payoutId)||!/^[a-f0-9-]{36}$/.test(result.transferId)||result.payoutId===first.payoutId||result.transferId===first.transferId)throw Error('Resultado do segundo teste requer conferência.');
 const query=sql=>run(['exec',db,'psql','-v','ON_ERROR_STOP=1','-U','ramo_sandbox','-d','ramo_asaas_sandbox','-Atq','-c',sql]).trim();
 const status=query("SELECT status FROM driver_payouts WHERE id='"+result.payoutId+"'");
 const ledger=Number(query("SELECT count(*) FROM ledger_transactions WHERE reference_key='driver-payout-paid:"+result.payoutId+"'"));
 if(ledger>1)throw Error('Conferência da baixa única necessária.');
 const receiptsFile=join(originalData,'webhook-receipts.jsonl');
 const receipts=existsSync(receiptsFile)?readFileSync(receiptsFile,'utf8').split('\n').filter(Boolean).map(JSON.parse):[];
 const evidence=webhookEvidence(result,receipts,status,ledger);
 for(let i=0;i<oldFiles.length;i++)if(hash(readFileSync(oldFiles[i]))!==before[i])throw Error('Registro do primeiro teste mudou.');
 const end=snapshot();validateRuntime(end);for(const k of Object.keys(start))if(start[k].Id!==end[k].Id||start[k].State.StartedAt!==end[k].State.StartedAt)throw Error('Um serviço ativo mudou durante o teste.');
 for(const name of [db,receiver]){const c=inspect(name),initial=name===db?pg:http;if(c.Id!==initial.Id||c.State.StartedAt!==initial.State.StartedAt||!c.State.Running)throw Error('Laboratório mudou durante o teste.');}
 writeFileSync(join(phase,'acceptance.json'),JSON.stringify({at:new Date().toISOString(),sessionId:s.id,payoutId:result.payoutId,transferId:result.transferId,status,postAttempts:result.postAttempts,ledgerPaidEntries:ledger,...evidence},null,2),{mode:0o600});
 console.log('Status do segundo repasse: '+status+'. Tentativas de envio nesta sessão: '+result.postAttempts+'.');
 console.log('ID no Asaas Sandbox: '+result.transferId);
 console.log('Eventos autenticados deste repasse: '+evidence.incomingEvents+'. TRANSFER_DONE recebido: '+(evidence.doneReceived?'sim':'não')+'.');
 if(evidence.externalWebhookDeliveryVerified)console.log('WEBHOOK SANDBOX CONFERIDO: evento de conclusão recebido e uma única baixa no ledger. Confira também HTTP 200 nos Logs de Webhooks do Asaas.');
 else if(status==='processing')console.log('AGUARDANDO: autorize somente esta nova transferência no painel Sandbox se o Asaas solicitar. Depois repita este mesmo comando para consultar.');
 else if(status==='paid')console.log('Repasse concluído; entrega externa ainda não confirmada. Confira os Logs de Webhooks e repita este mesmo comando para consultar.');
 else console.log('Resultado requer conferência. Sessão preservada; nenhum reenvio automático.');
 console.log('Primeiro repasse preservado. Receptor e banco de testes continuam ligados. Serviços ativos, Mercado Pago e banco ativo preservados.');
}catch(error){console.error(error?.message??'Conferência necessária.');process.exitCode=1;}
finally{unlinkSync(lock);}

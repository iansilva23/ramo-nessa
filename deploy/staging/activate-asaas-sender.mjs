// Authorised production arming: same Core image; manual payout policy untouched.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {runtimeIdentity} from './backup-regions-pricing.mjs';
import {environmentMap,escapeCompose,servicePlan,assertEnvironmentMatches} from './asaas-activation-plan-contract.mjs';
import {assertRuntime} from './regions-activation-contract.mjs';
import {senderPlan,assertSenderDelta,synchronizeWebhook,providerProbe} from './asaas-sender-contract.mjs';

export async function activateSender({testRemote,testFailure}={}){
 if(process.getuid?.()!==0)throw Error('Execute com sudo.');
 process.umask(0o077);
 const root='/opt/ramo-nessa-asaas-production-sender';mkdirSync(root,{recursive:true,mode:0o700});
 const stat=lstatSync(root);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==0||(stat.mode&0o077))throw Error('Diretório operacional precisa ser privado.');
 const lock=join(root,'execution.lock');closeSync(openSync(lock,'wx',0o600));
 let interrupted=false;const interrupt=()=>{interrupted=true;};for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,interrupt);
 const barrier=()=>{if(interrupted)throw Error('Interrupção solicitada.');};
 let dir,phase='preflight',attempted=false,before,image,models,policyBefore,flagsBefore,sourcePath,sourceBytes;
 const names={core:'ramo-nessa-staging-core-1',gateway:'ramo-nessa-staging-gateway-1',postgres:'ramo-nessa-staging-postgres-1',maps:'ramo-nessa-staging-google-maps-mock-1',site:'ramo-nessa-site-institutional-site-1'};
 const save=(p,v)=>writeFileSync(join(dir,p),typeof v==='string'?v:JSON.stringify(v,null,2),{mode:0o600});
 const run=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024**2,env:{PATH:process.env.PATH}});if(r.error||r.status!==0){if(dir)save('last-command.private.log',String(r.stdout??'')+String(r.stderr??''));throw Error('Etapa não concluída: '+phase+'. Diagnóstico privado preservado.');}return r.stdout;};
 const docker=args=>run('docker',args),inspect=name=>JSON.parse(docker(['inspect',name]))[0];
 const sql=q=>docker(['exec',names.postgres,'sh','-c','PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -c "$1"','asaas-read-only','BEGIN READ ONLY; '+q+'; COMMIT;']).trim();
 const policy=()=>JSON.parse(sql('SELECT row_to_json(t) FROM (SELECT mode,automatic_enabled,anticipation_minimum_cents,anticipation_fee_cents FROM driver_payout_settings WHERE id=1) t'));
 const flags=()=>sql('SELECT json_build_object(\'boarding\',(SELECT enabled FROM ride_boarding_policy),\'occurrences\',(SELECT enabled FROM ride_occurrence_policy),\'bonus\',(SELECT bonus_enabled FROM ride_occurrence_policy))');
 const noPending=()=>{if(Number(sql("SELECT count(*) FROM driver_payouts WHERE status IN ('requested','processing')"))!==0)throw Error('Há repasses pendentes. Ativação exige conferência específica.');};
 function unchanged(){
  for(const role of ['gateway','postgres','maps','site'])if(runtimeIdentity(inspect(names[role]))!==runtimeIdentity(before[role]))throw Error('Serviço fora do escopo mudou: '+role);
  if(!readFileSync(sourcePath).equals(sourceBytes))throw Error('Configuração de origem mudou.');
  if(!isDeepStrictEqual(policy(),policyBefore)||flags()!==flagsBefore)throw Error('Políticas mudaram durante a operação.');
 }
 const up=kind=>docker(['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,kind+'.compose.private.json'),'up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','90','core']);
 const check=kind=>assertRuntime(before.core,inspect(names.core),'core',image,models[kind],null);
 let ci=false;
 const healthy=async()=>{const origin=ci?'http://127.0.0.1:18080':'https://app.ramonessa.com.br';const r=await fetch(origin+'/ready',{redirect:'manual',signal:AbortSignal.timeout(15000)});if(r.status!==200||(await r.json()).ok!==true)throw Error('Readiness não confirmada.');};
 try{
  before=Object.fromEntries(Object.entries(names).map(([role,name])=>[role,inspect(name)]));
  for(const [role,c]of Object.entries(before))if(!c.State.Running||(c.State.Health&&c.State.Health.Status!=='healthy'))throw Error('Serviço sem saúde: '+role);
  ci=process.env.GITHUB_ACTIONS==='true'&&before.core.Config.Labels?.['br.com.ramonessa.asaas-arm-ci']==='true';
  if((testRemote||testFailure)&&!ci)throw Error('Provas simuladas são exclusivas do ambiente CI identificado.');
  const env=environmentMap(before.core.Config.Env);
  if(env.DRIVER_PAYOUT_PROVIDER_NAME!=='asaas'||env.ASAAS_PAYOUT_MODE!=='production'||env.ASAAS_WEBHOOK_ENABLED!=='true'||env.ASAAS_PAYOUTS_ENABLED!=='false')throw Error('O receptor mudou ou os envios já estão habilitados. Não repita a ativação.');
  policyBefore=policy();flagsBefore=flags();if(policyBefore.mode!=='manual'||policyBefore.automatic_enabled!==false)throw Error('O modo de repasse mudou; preservado sem ativação.');noPending();
  await healthy();
  const files=(before.core.Config.Labels?.['com.docker.compose.project.config_files']??'').split(',');
  if(files.length!==1||!files[0].startsWith('/'))throw Error('Origem Compose exige revisão.');sourcePath=files[0];const st=lstatSync(sourcePath);if(!st.isFile()||st.isSymbolicLink()||st.uid!==0)throw Error('Modelo de execução inválido.');sourceBytes=readFileSync(sourcePath);
  const resolved=JSON.parse(docker(['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',sourcePath,'config','--format','json']));
  image=JSON.parse(docker(['image','inspect',before.core.Image]))[0];assertEnvironmentMatches(resolved.services.core,before.core,image);
  const original=servicePlan(resolved,'core',before.core,image.Id);original.services.core.environment=escapeCompose(env);
  const cutover=new Date().toISOString(),candidate=senderPlan(original,cutover);assertSenderDelta(original,candidate,cutover);
  // Keep the new cutover even when disabling submissions after a failure so
  // any legitimate in-flight webhook can still reconcile a new reservation.
  const rollback=structuredClone(candidate);rollback.services.core.environment.ASAAS_PAYOUTS_ENABLED='false';models={candidate,rollback};
  dir=join(root,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(5).toString('hex'));mkdirSync(dir,{mode:0o700});
  save('runtime-before.private.json',before);save('source-before.private.json',sourceBytes.toString());save('policy-before.private.json',policyBefore);
  for(const kind of ['candidate','rollback']){save(kind+'.compose.private.json',models[kind]);const round=JSON.parse(docker(['compose','--project-name','ramo-nessa-staging','--env-file','/dev/null','-f',join(dir,kind+'.compose.private.json'),'config','--format','json']));if(!isDeepStrictEqual(round.services.core.environment,models[kind].services.core.environment))throw Error('Releitura do ambiente divergente.');}
  console.log('Conferindo e sincronizando a autenticação do webhook existente. Nenhum Pix será enviado.');
  phase='webhook';
  if(testRemote)await testRemote();else{
   const code=`import {readFileSync} from 'node:fs';const synchronizeWebhook=${synchronizeWebhook.toString()};const secret=n=>(process.env[n]||readFileSync(process.env[n+'_FILE'],'utf8')).trim();try{await synchronizeWebhook({apiKey:secret('ASAAS_API_KEY'),token:secret('ASAAS_WEBHOOK_TOKEN')});console.log('WEBHOOK_SYNCHRONIZED');}catch{console.error('WEBHOOK_SYNC_FAILED');process.exitCode=1;}`;
   if(docker(['exec',names.core,'node','--input-type=module','-e',code]).trim()!=='WEBHOOK_SYNCHRONIZED')throw Error('Webhook não confirmado.');
  }
  barrier();unchanged();noPending();if(runtimeIdentity(inspect(names.core))!==runtimeIdentity(before.core))throw Error('Core mudou durante a preparação.');
  phase='activating';save('journal.json',{phase,cutover,image:image.Id,manual:true});attempted=true;
  console.log('Habilitando Asaas somente para novos repasses, mantendo o modo manual...');up('candidate');barrier();check('candidate');await healthy();unchanged();
  phase='provider-probe';if(docker(['exec',names.core,'node','--input-type=module','-e',providerProbe]).trim()!=='ASAAS_SENDER_PROBE_OK')throw Error('Proteções do provedor não confirmadas.');
  if(!ci){
   const code=`import {readFileSync} from 'node:fs';const token=(process.env.ASAAS_WEBHOOK_TOKEN||readFileSync(process.env.ASAAS_WEBHOOK_TOKEN_FILE,'utf8')).trim();for(const [auth,status]of [[false,401],[true,400]]){const r=await fetch('https://app.ramonessa.com.br/v1/webhooks/asaas/transfers',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json',...(auth?{'asaas-access-token':token}:{})},body:'{}'});if(r.status!==status)throw Error('Webhook authentication probe failed');}console.log('AUTHENTICATION_OK');`;
   if(docker(['exec',names.core,'node','--input-type=module','-e',code]).trim()!=='AUTHENTICATION_OK')throw Error('Autenticação pública não confirmada.');
  }
  if(testFailure)await testFailure();barrier();unchanged();save('journal.json',{phase:'completed',cutover,image:image.Id,manual:true});
  console.log(JSON.stringify({status:'ASAAS_PRODUCAO_HABILITADO',enviosHabilitados:true,modoRepasse:policyBefore.mode,automatico:false,inicioNovosRepasses:cutover,antecipacaoMinimaCentavos:policyBefore.anticipation_minimum_cents,taxaAntecipacaoCentavos:policyBefore.anticipation_fee_cents,imagemCorePreservada:true,nenhumRepasseCriado:true,directory:dir}));
 }catch(error){
  if(dir)save('error.private.log',error.stack??String(error));
  if(attempted){
   try{unchanged();const current=inspect(names.core);const checked=structuredClone(current);checked.State.Health={Status:'healthy'};assertRuntime(before.core,checked,'core',image,models.candidate,null);up('rollback');check('rollback');await healthy();unchanged();save('journal.json',{phase:'disabled-after-failure',cutover:models.rollback.services.core.environment.ASAAS_PAYOUT_START_AFTER});throw Object.assign(Error('Ativação interrompida; envios novamente bloqueados e receptor preservado.'),{reported:true});}
   catch(recovery){if(recovery.reported)throw recovery;throw Error('Ativação requer conferência. Não repita o comando. Registros privados em '+dir);}
  }
  throw error;
 }finally{for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.off(signal,interrupt);unlinkSync(lock);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv[2]!=='--activate-production-manual')throw Error('Informe --activate-production-manual.');try{await activateSender();}catch(e){console.error(e.message);process.exitCode=1;}}

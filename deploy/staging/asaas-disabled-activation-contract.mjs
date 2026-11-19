import {isDeepStrictEqual} from 'node:util';
export function validateActivationReadiness({plan,fresh,closed,manifest,now=Date.now()}){
 const revision='5ffae79687965042765f40f53cd32e57510dfbfe';
 if(plan.candidateRevision!==revision||fresh.candidateRevision!==revision||manifest.candidateRevision!==revision||fresh.stage!=='before-activation')throw Error('Candidata/backup divergentes.');
 if(plan.asaasEnabled!==false||plan.migrationApplied!==false||plan.servicesChanged!==false||fresh.migrationAppliedToActive!==false||fresh.asaasActivated!==false)throw Error('Estado inicial do plano divergente.');
 if(!plan.sandboxAccepted||!plan.operatorReportedHttp200||closed.phase!=='closed'||closed.enabled!==false)throw Error('Aceite ou encerramento Sandbox pendente.');
 if(!manifest.restored||!manifest.migrationOnlyOnCopy||!manifest.oldAndNewRepositoryRead||!manifest.businessDataUnchanged)throw Error('Backup não possui restauração/compatibilidade verificadas.');
 const age=now-Date.parse(fresh.createdAt);if(!Number.isFinite(age)||age<0||age>3600000)throw Error('Backup de ativação precisa ter menos de uma hora. Nenhuma atualização iniciada.');
 if(!isDeepStrictEqual(plan.scope,['migration086','core','admin-gateway']))throw Error('Escopo da ativação divergiu.');
}
export function assertSchemaAfter(before,after,checksum){
 const expected=[...before,{filename:'086_asaas_driver_payouts.sql',checksum}].sort((a,b)=>a.filename.localeCompare(b.filename,'en'));
 // Filenames are ASCII; PostgreSQL and JS ordering can differ only around locale-sensitive punctuation.
 const sort=rows=>[...rows].sort((a,b)=>a.filename<b.filename?-1:a.filename>b.filename?1:0);
 if(!isDeepStrictEqual(sort(expected),sort(after)))throw Error('Histórico após migration não corresponde somente à 086.');
}
export async function switchDisabledRuntime(actions){
 await actions.migrate();let coreTouched=false,gatewayTouched=false;
 try{
  coreTouched=true;await actions.upCore();await actions.checkCore();
  gatewayTouched=true;await actions.upGateway();await actions.checkGateway();await actions.verify();
  return{coreUpdated:true,gatewayUpdated:true};
 }catch(error){
  const failures=[];
  if(coreTouched)try{await actions.rollbackCore();}catch{failures.push('core');}
  if(gatewayTouched)try{await actions.rollbackGateway();}catch{failures.push('gateway');}
  try{await actions.verifyRollback();}catch{failures.push('verification');}
  const failure=Error(failures.length?'Ativação interrompida; retorno requer conferência.':'Ativação interrompida; imagens anteriores restauradas e verificadas.');
  failure.rollbackComplete=failures.length===0;failure.rollbackFailures=failures;failure.cause=error;throw failure;
 }
}

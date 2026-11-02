import {join} from 'node:path';
export function backupPaths(root,mode){
 if(!['initial','before-activation'].includes(mode))throw Error('Modo de backup inválido.');
 const parent=mode==='before-activation'?join(root,'activation-plan'):root;
 return{parent,verified:join(parent,'backup-verified.json')};
}
export function validateFreshBackup({plan,closed,previous,revision}){
 if(plan.candidateRevision!==revision||previous.candidateRevision!==revision||plan.migrationApplied!==false||plan.servicesChanged!==false||plan.asaasEnabled!==false)throw Error('Plano ou backup original divergentes.');
 if(closed.phase!=='closed'||closed.enabled!==false||closed.servicesUnchanged!==true||closed.evidencePreserved!==true)throw Error('Encerre o Sandbox antes do backup de ativação.');
 if(!plan.sandboxAccepted||!plan.operatorReportedHttp200||!plan.freshBackupRequired)throw Error('Aceite ou exigência de backup divergentes.');
 if(JSON.stringify(plan.scope)!==JSON.stringify(['migration086','core','admin-gateway']))throw Error('Escopo do plano mudou.');
 return true;
}

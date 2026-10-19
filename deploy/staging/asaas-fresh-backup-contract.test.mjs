import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backupPaths,validateFreshBackup} from './asaas-fresh-backup-contract.mjs';
const revision='5ffae79687965042765f40f53cd32e57510dfbfe';
const state=()=>({revision,plan:{candidateRevision:revision,migrationApplied:false,servicesChanged:false,asaasEnabled:false,sandboxAccepted:true,operatorReportedHttp200:true,freshBackupRequired:true,scope:['migration086','core','admin-gateway']},previous:{candidateRevision:revision},closed:{phase:'closed',enabled:false,servicesUnchanged:true,evidencePreserved:true}});
test('fresh backup uses a separate directory/marker and cannot replace initial verified backup',()=>{
 const root='/var/backups/ramo-nessa-asaas/5ffae7968796';assert.equal(backupPaths(root,'initial').verified,root+'/backup-verified.json');assert.equal(backupPaths(root,'before-activation').verified,root+'/activation-plan/backup-verified.json');assert.notEqual(backupPaths(root,'initial').parent,backupPaths(root,'before-activation').parent);assert.throws(()=>backupPaths(root,'other'));
});
test('fresh backup requires accepted, disabled and closed Sandbox with the prepared inactive scope',()=>{
 assert.equal(validateFreshBackup(state()),true);
 for(const field of ['migrationApplied','servicesChanged','asaasEnabled']){const s=state();s.plan[field]=true;assert.throws(()=>validateFreshBackup(s));}
 for(const field of ['sandboxAccepted','operatorReportedHttp200','freshBackupRequired']){const s=state();s.plan[field]=false;assert.throws(()=>validateFreshBackup(s));}
 for(const changes of [{phase:'subscription-disabled'},{enabled:true},{servicesUnchanged:false},{evidencePreserved:false}]){const s=state();Object.assign(s.closed,changes);assert.throws(()=>validateFreshBackup(s));}
 const wrong=state();wrong.plan.scope.push('payments');assert.throws(()=>validateFreshBackup(wrong));
});

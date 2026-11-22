import {createHash,randomUUID} from 'node:crypto';
import type {AdminActor,AdminRepository} from '../admin/admin-repository.js';
import type {PricingCatalogSnapshot} from './catalog-snapshot.js';
import type {PricingCatalogVersionRepository,PricingCatalogVersionRecord} from './pricing-catalog-version-repository.js';
import {resolvePricingCatalogContext} from './effective-catalog.js';
import {prepareThreeRegionCatalog,catalogRevision,RESET_ID} from './management-service.js';
import {ManagementError} from './managed-operations.js';
export interface CatalogResetPlan {
  format:1;migrationId:typeof RESET_ID;sourceRevision:string;sourceVersionId:string|null;
  sourceSnapshot:PricingCatalogSnapshot;sourceDigest:string;requestId:string;
}
export function snapshotDigest(snapshot:PricingCatalogSnapshot):string{
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
export async function prepareCatalogResetPlan(versions:PricingCatalogVersionRepository):Promise<CatalogResetPlan>{
  const current=await resolvePricingCatalogContext({versions});
  // Validate feasibility before creating a reviewable plan.
  prepareThreeRegionCatalog(current.snapshot);
  return {format:1,migrationId:RESET_ID,sourceRevision:catalogRevision(current.version),sourceVersionId:current.version?.id??null,
    sourceSnapshot:structuredClone(current.snapshot),sourceDigest:snapshotDigest(current.snapshot),requestId:randomUUID()};
}
export async function applyCatalogResetPlan(input:{
  plan:CatalogResetPlan;versions:PricingCatalogVersionRepository;admin:AdminRepository;actor:AdminActor;now?:Date;
}):Promise<{record:PricingCatalogVersionRecord|null;unchanged:boolean}>{
  const now=input.now??new Date(),current=await resolvePricingCatalogContext({versions:input.versions,at:now});
  if(current.snapshot.managementMigration?.id===RESET_ID)return {record:current.version,unchanged:true};
  const p=input.plan;
  if(p.format!==1||p.migrationId!==RESET_ID||p.sourceDigest!==snapshotDigest(p.sourceSnapshot)||
      p.sourceRevision!==catalogRevision(current.version)||p.sourceDigest!==snapshotDigest(current.snapshot))
    throw new ManagementError('RESET_PLAN_STALE','O catálogo mudou ou o plano está inválido. Gere e revise um novo plano.',409);
  if(!input.versions.commitDirect)throw new ManagementError('DIRECT_SAVE_UNAVAILABLE','Persistência atômica indisponível.',503);
  const snapshot=prepareThreeRegionCatalog(current.snapshot);
  snapshot.managementMigration={id:RESET_ID,sourceVersionId:current.version?.id??null};
  delete snapshot.managementChange;
  const instant=now.toISOString();
  const record=await input.versions.commitDirect({
    expectedEffectiveId:current.version?.id??null,admin:input.admin,
    record:{id:p.requestId,status:'published',snapshot,createdBy:input.actor,publishedBy:input.actor,effectiveFrom:instant,createdAt:instant,updatedAt:instant,publishedAt:instant},
    audit:{id:randomUUID(),actor:input.actor,action:'pricing.management.catalog_reset',targetType:'pricing_catalog_version',targetId:p.requestId,createdAt:instant,
      metadata:{migrationId:RESET_ID,sourceDigest:p.sourceDigest,previousVersionId:p.sourceVersionId,before:current.snapshot,after:snapshot}},
  });
  if(!record)throw new ManagementError('RESET_PLAN_STALE','Configuração concorrente ou agendada. Nenhuma limpeza foi aplicada.',409);
  return {record,unchanged:false};
}
export async function restoreCatalogBeforeReset(input:{
  plan:CatalogResetPlan;expectedRevision:string;versions:PricingCatalogVersionRepository;admin:AdminRepository;actor:AdminActor;now?:Date;
}){
  const current=await resolvePricingCatalogContext({versions:input.versions,at:input.now??new Date()}),p=input.plan;
  if(p.format!==1||p.migrationId!==RESET_ID||p.sourceDigest!==snapshotDigest(p.sourceSnapshot)||
      current.snapshot.managementMigration?.id!==RESET_ID||catalogRevision(current.version)!==input.expectedRevision)
    throw new ManagementError('RESTORE_PLAN_STALE','Revise o catálogo atual e o plano antes de restaurar.',409);
  if(!input.versions.commitDirect)throw new ManagementError('DIRECT_SAVE_UNAVAILABLE','Persistência atômica indisponível.',503);
  const instant=(input.now??new Date()).toISOString(),recordId=randomUUID();
  const restored=await input.versions.commitDirect({
    expectedEffectiveId:current.version?.id??null,admin:input.admin,
    record:{id:recordId,status:'published',snapshot:structuredClone(p.sourceSnapshot),createdBy:input.actor,publishedBy:input.actor,effectiveFrom:instant,createdAt:instant,updatedAt:instant,publishedAt:instant},
    audit:{id:randomUUID(),actor:input.actor,action:'pricing.management.catalog_reset_restored',targetType:'pricing_catalog_version',targetId:recordId,createdAt:instant,
      metadata:{previousVersionId:current.version?.id,sourceDigest:p.sourceDigest,before:current.snapshot,after:p.sourceSnapshot}},
  });
  if(!restored)throw new ManagementError('RESTORE_PLAN_STALE','Configuração concorrente. Restauração cancelada.',409);
  return restored;
}

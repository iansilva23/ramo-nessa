import { createHash, randomUUID } from 'node:crypto';
import type { AdminActor, AdminRepository } from '../admin/admin-repository.js';
import type { PricingCatalogSnapshot } from './catalog-snapshot.js';
import type { PricingCatalogVersionRepository, PricingCatalogVersionRecord } from './pricing-catalog-version-repository.js';
import { resolvePricingCatalogContext } from './effective-catalog.js';
import { CATEGORY_NAMES, OPERATIONAL_CATEGORIES, ManagementError, parseRegion, parseCategory, parseRate, validateOperations, type ManagedOperations } from './managed-operations.js';

export const RESET_ID = 'three-regions-empty-fares-20261020';
export function catalogRevision(record: PricingCatalogVersionRecord | null): string {
  return record == null ? 'static' : record.id + ':' + record.updatedAt;
}
export function prepareThreeRegionCatalog(source: PricingCatalogSnapshot): PricingCatalogSnapshot {
  const next = structuredClone(source);
  const definitions = source.managedOperations?.categories ?? source.categories.map(category => ({
    id:category,name:CATEGORY_NAMES[category],description:'',icon:category,enabled:source.categoryPolicies[category].enabled,
    archived:false,maxPassengers:category==='moto'||category==='delivery'?1:4,
    requiresFourByFourOnJeriBoundary:source.categoryPolicies[category].requiresFourByFourOnJeriBoundary,
  }));
  const meta = [
    {id:'jericoacoara',name:'Jericoacoara',municipality:'Jijoca de Jericoacoara',latitude:-2.80023,longitude:-40.51638},
    {id:'jijoca',name:'Jijoca (sede)',municipality:'Jijoca de Jericoacoara',latitude:-2.89860,longitude:-40.45060},
    {id:'prea',name:'Preá',municipality:'Cruz',latitude:-2.82017,longitude:-40.41467},
  ] as const;
  next.managedOperations = validateOperations({
    schema:1,categories:definitions,rates:[],
    regions:meta.map(r=>{
      const existing=source.localityGeofences.find(g=>g.zoneId===r.id&&g.localityId===r.id);
      if (!existing) throw new ManagementError('RESET_GEOFENCE_MISSING','Revise a cobertura de '+r.name+' antes de preparar o catálogo.',409);
      // Existing coordinates/radii are retained; no coverage is guessed.
      return {...r,zoneId:r.id,state:'CE',radiusKm:existing.radiusKm,
        latitude:existing.centerLatitude,longitude:existing.centerLongitude,
        categoryIds:definitions.filter(c=>!c.archived&&c.enabled).map(c=>c.id),enabled:true,archived:false};
    }),
  });
  next.fixedRoutes=[]; next.distanceFarePolicies=[];
  next.jeri.deliveryBands=[]; next.jeri.deliveryAboveMaxCents=0;
  next.jeri.buggy={...next.jeri.buggy,dayBaseCents:0,after22BaseCents:0,perPassengerCents:0};
  next.surcharges={preaComfortCents:0,preaLocalCarAfter22Cents:0,preaLocalCarAfter22LocalityIds:[]};
  delete next.commercialPolicy;
  if(next.sharedTransfers)next.sharedTransfers={...next.sharedTransfers,enabled:false,routes:[]};
  return synchronizeManagedSnapshot(next);
}
export function synchronizeManagedSnapshot(snapshot: PricingCatalogSnapshot): PricingCatalogSnapshot {
  const ops = snapshot.managedOperations;
  if (!ops) throw new ManagementError('CATALOG_NOT_PREPARED','O catálogo precisa da preparação autorizada.',409);
  snapshot.localities={prea:{},jijoca:{}};
  snapshot.localityPolicies={prea:{},jijoca:{}};
  snapshot.localityDisplayNames={prea:{},jijoca:{},external:{}};
  snapshot.externalLocalities=[];
  snapshot.localityGeofences=[];
  for(const zone of snapshot.zones)snapshot.zonePolicies[zone]={enabled:false};
  for(const region of ops.regions.filter(r=>r.enabled&&!r.archived)){
    snapshot.zonePolicies[region.zoneId]={enabled:true};
    snapshot.localityGeofences.push({zoneId:region.zoneId,localityId:region.id,centerLatitude:region.latitude,centerLongitude:region.longitude,radiusKm:region.radiusKm});
    if(region.zoneId==='prea'||region.zoneId==='jijoca'){
      snapshot.localities[region.zoneId][region.id]={};
      snapshot.localityPolicies[region.zoneId][region.id]={enabledCategories:region.categoryIds.filter(id=>OPERATIONAL_CATEGORIES.includes(id as typeof OPERATIONAL_CATEGORIES[number])) as typeof OPERATIONAL_CATEGORIES[number][],applyNightSurcharge:false};
      snapshot.localityDisplayNames[region.zoneId][region.id]=region.name;
    }else if(region.zoneId==='external'){
      snapshot.externalLocalities.push(region.id);snapshot.localityDisplayNames.external[region.id]=region.name;
    }
  }
  for(const category of OPERATIONAL_CATEGORIES){
    const definition=ops.categories.find(c=>c.id===category);
    snapshot.categoryPolicies[category]={enabled:!!definition?.enabled&&!definition.archived,
      requiresFourByFourOnJeriBoundary:definition?.requiresFourByFourOnJeriBoundary??false};
  }
  const buggy=ops.categories.find(c=>c.id==='buggy');
  if(buggy)snapshot.jeri.buggy.maxPassengers=buggy.maxPassengers;
  return snapshot;
}
export type ManagementMutation =
  | {kind:'region.save';region:unknown;rates?:unknown[]}
  | {kind:'category.save';category:unknown}
  | {kind:'rate.save';rate:unknown}
  | {kind:'region.archive'|'category.archive'|'rate.archive';id:string}
  | {kind:'settings.save';nightStartHour:number;dayStartHour:number};
function put<T extends {id:string}>(rows:T[], value:T):T[]{
  return rows.some(r=>r.id===value.id)?rows.map(r=>r.id===value.id?value:r):[...rows,value];
}
export function applyManagementMutation(source:PricingCatalogSnapshot, raw:unknown):{snapshot:PricingCatalogSnapshot;sensitive:boolean;kind:string}{
  if(!source.managedOperations)throw new ManagementError('CATALOG_NOT_PREPARED','O catálogo atual está preservado. Aguarde a preparação autorizada da nova organização.',409);
  if(raw==null||typeof raw!=='object'||Array.isArray(raw))throw new ManagementError('MANAGEMENT_INVALID','Alteração inválida.');
  const mutation=raw as ManagementMutation;
  const snapshot=structuredClone(source), ops=snapshot.managedOperations!;
  let sensitive=false;
  if(mutation.kind==='region.save'){
    const region=parseRegion(mutation.region);
    const before=ops.regions.find(r=>r.id===region.id);
    if(before&&before.zoneId!==region.zoneId)throw new ManagementError('REGION_ID_IMMUTABLE','A área de uma região existente não pode mudar.');
    sensitive=!!before?.enabled&&!before.archived;
    ops.regions=put(ops.regions,region);
    if(mutation.rates!=null){
      if(!Array.isArray(mutation.rates)||mutation.rates.length>100)throw new ManagementError('MANAGEMENT_INVALID','Tarifas inválidas.');
      for(const raw of mutation.rates){
        const rate=parseRate(raw);
        if(rate.originRegionId!==region.id&&rate.destinationRegionId!==region.id)throw new ManagementError('MANAGEMENT_INVALID','O assistente só altera tarifas desta região.');
        const prior=ops.rates.find(r=>r.id===rate.id);
        if(prior?.enabled&&!prior.archived)sensitive=true;
        ops.rates=put(ops.rates,rate);
      }
    }
    // Removing operational permission also disables affected tariffs atomically.
    ops.rates=ops.rates.map(r=>(r.originRegionId===region.id||r.destinationRegionId===region.id)&&
      (!region.enabled||region.archived||!region.categoryIds.includes(r.categoryId))?{...r,enabled:false}:r);
  }else if(mutation.kind==='category.save'){
    const category=parseCategory(mutation.category);
    const before=ops.categories.find(c=>c.id===category.id);
    sensitive=!!before?.enabled&&!before.archived;
    ops.categories=put(ops.categories,category);
    if(!category.enabled||category.archived)ops.rates=ops.rates.map(r=>r.categoryId===category.id?{...r,enabled:false}:r);
  }else if(mutation.kind==='rate.save'){
    const rate=parseRate(mutation.rate), before=ops.rates.find(r=>r.id===rate.id);
    sensitive=!!before?.enabled&&!before.archived;
    ops.rates=put(ops.rates,rate);
  }else if(mutation.kind==='region.archive'||mutation.kind==='category.archive'||mutation.kind==='rate.archive'){
    const rows=mutation.kind==='region.archive'?ops.regions:mutation.kind==='category.archive'?ops.categories:ops.rates;
    const row=rows.find(r=>r.id===mutation.id);
    if(!row)throw new ManagementError('MANAGEMENT_NOT_FOUND','Registro não encontrado.',404);
    row.archived=true;row.enabled=false;sensitive=true;
    ops.rates=ops.rates.map(r=>
      mutation.kind==='region.archive'&&(r.originRegionId===row.id||r.destinationRegionId===row.id)||
      mutation.kind==='category.archive'&&r.categoryId===row.id?{...r,enabled:false}:r);
  }else if(mutation.kind==='settings.save'){
    const {nightStartHour,dayStartHour}=mutation;
    if(!Number.isInteger(nightStartHour)||!Number.isInteger(dayStartHour)||nightStartHour<0||nightStartHour>23||dayStartHour<0||dayStartHour>23||nightStartHour===dayStartHour)
      throw new ManagementError('MANAGEMENT_INVALID','Informe horários distintos entre 0 e 23.');
    snapshot.periodPolicy={nightStartHour,dayStartHour};sensitive=true;
  }else throw new ManagementError('MANAGEMENT_INVALID','Operação desconhecida.');
  snapshot.managedOperations=validateOperations(ops);
  return {snapshot:synchronizeManagedSnapshot(snapshot),sensitive,kind:mutation.kind};
}
export function managementView(snapshot:PricingCatalogSnapshot, version:PricingCatalogVersionRecord|null){
  return {
    revision:catalogRevision(version),prepared:snapshot.managedOperations!=null,
    operations:snapshot.managedOperations??null,periodPolicy:snapshot.periodPolicy,
    legacySummary:snapshot.managedOperations?null:{
      localities:Object.keys(snapshot.localities.prea).length+Object.keys(snapshot.localities.jijoca).length+snapshot.externalLocalities.length+1,
      fixedRoutes:snapshot.fixedRoutes.length,distanceRules:snapshot.distanceFarePolicies.length,
    },
    supportedCategoryIds:[...OPERATIONAL_CATEGORIES],
    migrationId:snapshot.managementMigration?.id??null,
  };
}
export async function saveManagementChange(input:{
  versions:PricingCatalogVersionRepository;admin:AdminRepository;actor:AdminActor;
  requestId:string;expectedRevision:string;mutation:unknown;reauthenticate:()=>Promise<void>;now?:Date;
}){
  if(input.actor.kind!=='user')throw new ManagementError('HUMAN_SESSION_REQUIRED','Use uma conta administrativa com senha e MFA.',403);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId))
    throw new ManagementError('MANAGEMENT_INVALID','Identificador da alteração inválido.');
  if(typeof input.expectedRevision!=='string')throw new ManagementError('MANAGEMENT_INVALID','Atualize a página antes de salvar.');
  const hash=createHash('sha256').update(JSON.stringify({revision:input.expectedRevision,mutation:input.mutation})).digest('hex');
  const previous=await input.versions.findById(input.requestId);
  if(previous){
    if(previous.snapshot.managementChange?.requestHash!==hash||previous.createdBy.id!==input.actor.id)
      throw new ManagementError('MANAGEMENT_CONFLICT','Identificador já usado por outra alteração.',409);
    return previous;
  }
  const now=input.now??new Date();
  const current=await resolvePricingCatalogContext({versions:input.versions,at:now});
  if(catalogRevision(current.version)!==input.expectedRevision)throw new ManagementError('MANAGEMENT_CONFLICT','Outro administrador alterou os dados. Atualize a tela e confira sua alteração.',409);
  const changed=applyManagementMutation(current.snapshot,input.mutation);
  if(changed.sensitive)await input.reauthenticate();
  changed.snapshot.managementChange={requestHash:hash,baseRevision:input.expectedRevision};
  if(!input.versions.commitDirect)throw new ManagementError('DIRECT_SAVE_UNAVAILABLE','Salvamento indisponível neste ambiente.',503);
  const instant=now.toISOString();
  const saved=await input.versions.commitDirect({
    expectedEffectiveId:current.version?.id??null,
    record:{id:input.requestId,status:'published',snapshot:changed.snapshot,effectiveFrom:instant,createdBy:input.actor,publishedBy:input.actor,createdAt:instant,updatedAt:instant,publishedAt:instant},
    admin:input.admin,
    audit:{id:randomUUID(),actor:input.actor,action:'pricing.management.'+changed.kind,targetType:'pricing_catalog_version',targetId:input.requestId,createdAt:instant,
      metadata:{previousVersionId:current.version?.id??null,before:current.snapshot.managedOperations,after:changed.snapshot.managedOperations,periodBefore:current.snapshot.periodPolicy,periodAfter:changed.snapshot.periodPolicy}},
  });
  if(!saved)throw new ManagementError('MANAGEMENT_CONFLICT','Os dados mudaram ou existe alteração agendada. Atualize a tela antes de continuar.',409);
  return saved;
}

import { splitCommission } from './commission.js';
import type { PricingCatalogSnapshot } from './catalog-snapshot.js';
import { PricingError, type FareQuote, type LocationRef, type QuoteRequest, type ServiceCategory, type ZoneId } from './types.js';

export const OPERATIONAL_CATEGORIES: readonly ServiceCategory[] = ['moto', 'delivery', 'car', 'comfort_black', 'buggy'];
export const CATEGORY_NAMES: Record<ServiceCategory, string> = {
  moto: 'Mototáxi', delivery: 'Entregas', car: 'Táxi', comfort_black: '4x4 Comfort/Black', buggy: 'Buggy',
};
export interface ManagedRegion {
  id: string;
  zoneId: ZoneId;
  name: string;
  municipality: string;
  state: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  categoryIds: string[];
  enabled: boolean;
  archived: boolean;
}
export interface ManagedCategory {
  id: string;
  name: string;
  description: string;
  icon: 'moto' | 'car' | 'buggy' | 'delivery' | 'comfort_black';
  enabled: boolean;
  archived: boolean;
  maxPassengers: number;
  requiresFourByFourOnJeriBoundary: boolean;
}
export interface ManagedRate {
  id: string;
  name: string;
  kind: 'fixed' | 'distance';
  originRegionId: string;
  destinationRegionId: string;
  bidirectional: boolean;
  categoryId: string;
  enabled: boolean;
  archived: boolean;
  day: { amountCents: number; minimumCents: number } | null;
  night: { amountCents: number; minimumCents: number } | null;
  includedPassengers: number;
  perExtraPassengerCents: number;
  extras: Array<{ name: string; amountCents: number; period: 'all' | 'day' | 'after_22' }>;
}
export interface ManagedOperations {
  schema: 1;
  regions: ManagedRegion[];
  categories: ManagedCategory[];
  rates: ManagedRate[];
}
export class ManagementError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 422) {
    super(message); this.name = 'ManagementError';
  }
}
const fail = (message: string): never => { throw new ManagementError('MANAGEMENT_INVALID', message); };
const object = (v: unknown): Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail('Dados inválidos.');
const text = (v: unknown, label: string, max = 100): string =>
  typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : fail(label + ' inválido.');
const flag = (v: unknown): boolean => typeof v === 'boolean' ? v : fail('Estado inválido.');
const num = (v: unknown, label: string, min: number, max: number, integer = false): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isSafeInteger(v))
    ? v : fail(label + ' inválido.');
const id = (v: unknown): string => {
  const value = text(v, 'Identificador', 80);
  return /^[a-z0-9][a-z0-9_-]*$/.test(value) && !['__proto__','constructor','prototype'].includes(value)
    ? value : fail('Identificador inválido.');
};
const strings = (v: unknown): string[] => Array.isArray(v) && v.length <= 100 && new Set(v).size === v.length
  ? v.map(id) : fail('Seleção de categorias inválida.');
const money = (v: unknown): number => num(v, 'Valor em centavos', 0, 100_000_000, true);
const isOperational = (value: string): value is ServiceCategory => OPERATIONAL_CATEGORIES.includes(value as ServiceCategory);
export function parseRegion(value: unknown): ManagedRegion {
  const v = object(value);
  const zoneId = text(v.zoneId, 'Área');
  if (!['jericoacoara','prea','jijoca','external'].includes(zoneId)) fail('Área inválida.');
  const state = text(v.state, 'Estado', 2).toUpperCase();
  if (!['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(state)) fail('Estado inválido.');
  const regionId = id(v.id);
  if (zoneId === 'jericoacoara' && regionId !== 'jericoacoara') fail('Use uma área própria para a nova região.');
  if (['jericoacoara','prea','jijoca'].includes(regionId) && regionId !== zoneId) fail('A região principal não pode trocar de área.');
  return {
    id: regionId, zoneId: zoneId as ZoneId, name: text(v.name,'Nome'), municipality: text(v.municipality,'Município'), state,
    latitude: num(v.latitude,'Latitude',-85.05112878,85.05112878),
    longitude: num(v.longitude,'Longitude',-180,180), radiusKm: num(v.radiusKm,'Raio',0.05,100),
    categoryIds: strings(v.categoryIds), enabled: flag(v.enabled), archived: flag(v.archived),
  };
}
export function parseCategory(value: unknown): ManagedCategory {
  const v = object(value);
  const icon = text(v.icon,'Ícone') as ServiceCategory;
  if (!isOperational(icon)) fail('Ícone inválido.');
  return {
    id: id(v.id), name: text(v.name,'Nome'), description: typeof v.description === 'string' && v.description.length <= 300 ? v.description.trim() : fail('Descrição inválida.'),
    icon, enabled: flag(v.enabled), archived: flag(v.archived), maxPassengers: num(v.maxPassengers,'Passageiros',1,4,true),
    requiresFourByFourOnJeriBoundary: flag(v.requiresFourByFourOnJeriBoundary),
  };
}
export function parseRate(value: unknown): ManagedRate {
  const v = object(value);
  const kind = text(v.kind,'Tipo');
  if (!['fixed','distance'].includes(kind)) fail('Tipo de tarifa inválido.');
  const period = (raw: unknown) => {
    if (raw === null) return null;
    const p = object(raw);
    const amountCents = money(p.amountCents), minimumCents = money(p.minimumCents);
    if (amountCents <= 0) fail('Informe um preço maior que zero ou desative o período.');
    if (kind === 'fixed' && minimumCents !== 0) fail('Tarifa fixa não utiliza mínimo separado.');
    return { amountCents, minimumCents };
  };
  if (!Array.isArray(v.extras) || v.extras.length > 10) fail('Adicionais inválidos.');
  return {
    id: id(v.id), name: text(v.name,'Nome'), kind: kind as ManagedRate['kind'],
    originRegionId: id(v.originRegionId), destinationRegionId: id(v.destinationRegionId),
    bidirectional: flag(v.bidirectional), categoryId: id(v.categoryId), enabled: flag(v.enabled), archived: flag(v.archived),
    day: period(v.day), night: period(v.night), includedPassengers: num(v.includedPassengers,'Passageiros incluídos',1,4,true),
    perExtraPassengerCents: money(v.perExtraPassengerCents),
    extras: v.extras.map(raw => {
      const e = object(raw), period = text(e.period,'Período');
      if (!['all','day','after_22'].includes(period)) fail('Período do adicional inválido.');
      return { name: text(e.name,'Nome do adicional',80), amountCents: money(e.amountCents), period: period as ManagedRate['extras'][number]['period'] };
    }),
  };
}
export function regionForRef(operations: ManagedOperations, ref: LocationRef): ManagedRegion | undefined {
  return operations.regions.find(r => r.id === (ref.localityId ?? ref.zoneId) && r.zoneId === ref.zoneId && r.enabled && !r.archived);
}
export function rateMatches(rate: ManagedRate, origin: string, destination: string): boolean {
  return rate.originRegionId === origin && rate.destinationRegionId === destination ||
    rate.bidirectional && rate.originRegionId === destination && rate.destinationRegionId === origin;
}
export function validateOperations(input: ManagedOperations): ManagedOperations {
  if (input.schema !== 1 || input.regions.length > 300 || input.categories.length > 100 || input.rates.length > 3000) fail('Catálogo excede o limite permitido.');
  const ops: ManagedOperations = { schema: 1, regions: input.regions.map(parseRegion), categories: input.categories.map(parseCategory), rates: input.rates.map(parseRate) };
  for (const rows of [ops.regions,ops.categories,ops.rates]) if (new Set(rows.map(r=>r.id)).size !== rows.length) fail('Há identificadores repetidos.');
  for (const c of ops.categories) {
    if (c.enabled && !c.archived && !isOperational(c.id)) fail('Esta categoria ainda não possui suporte operacional nos aplicativos. Mantenha-a desativada.');
    if ((c.id === 'moto' || c.id === 'delivery') && c.maxPassengers !== 1) fail('Moto e Entregas possuem capacidade operacional de uma pessoa.');
  }
  for (const r of ops.regions) {
    if (r.categoryIds.some(c=>!ops.categories.some(item=>item.id===c))) fail('A região contém categoria inexistente.');
    if (r.zoneId === 'jericoacoara' && r.enabled && !r.archived) {
      for (const key of ['car','comfort_black']) {
        if (r.categoryIds.includes(key) && ops.categories.find(c=>c.id===key)?.requiresFourByFourOnJeriBoundary !== true)
          fail('Veículos de carro em Jericoacoara precisam do requisito 4x4.');
      }
    }
  }
  const active = ops.rates.filter(r=>r.enabled&&!r.archived);
  for (const rate of ops.rates) {
    const a=ops.regions.find(r=>r.id===rate.originRegionId), b=ops.regions.find(r=>r.id===rate.destinationRegionId);
    const category=ops.categories.find(c=>c.id===rate.categoryId);
    if (!a || !b || !category) fail('Tarifa referencia região ou categoria inexistente.');
    if (!rate.enabled || rate.archived) continue;
    if (!a.enabled || a.archived || !b.enabled || b.archived || !category.enabled || category.archived ||
        !a.categoryIds.includes(rate.categoryId) || !b.categoryIds.includes(rate.categoryId)) fail('Ative a categoria nas duas regiões antes de ativar a tarifa.');
    if (!rate.day && !rate.night) fail('Ative pelo menos um período com preço válido.');
    if (rate.includedPassengers > category.maxPassengers) fail('Passageiros incluídos excedem a capacidade da categoria.');
    for (const other of active) {
      if (other.id === rate.id || other.categoryId !== rate.categoryId || other.kind !== rate.kind) continue;
      if ((rateMatches(other,rate.originRegionId,rate.destinationRegionId) ||
          rate.bidirectional && rateMatches(other,rate.destinationRegionId,rate.originRegionId)) &&
          (rate.day && other.day || rate.night && other.night)) fail('Já existe uma tarifa deste tipo para esta rota, categoria e período. Edite a tarifa existente.');
    }
  }
  return ops;
}
export function quoteManagedFare(request: QuoteRequest, catalog: PricingCatalogSnapshot): FareQuote {
  const ops = catalog.managedOperations!;
  const origin = regionForRef(ops,request.origin), destination = regionForRef(ops,request.destination);
  const category = ops.categories.find(c=>c.id===request.category&&c.enabled&&!c.archived&&isOperational(c.id));
  if (!origin || !destination) throw new PricingError('UNAVAILABLE_ZONE','Trajeto fora das regiões atendidas.');
  if (!category || !origin.categoryIds.includes(category.id) || !destination.categoryIds.includes(category.id))
    throw new PricingError('UNAVAILABLE_CATEGORY','Categoria indisponível para este trajeto.');
  const passengers = request.passengers ?? 1;
  if (!Number.isSafeInteger(passengers) || passengers < 1 || passengers > category.maxPassengers)
    throw new PricingError('INVALID_PASSENGER_COUNT','Quantidade de passageiros incompatível com a categoria.');
  const period = request.period === 'day' ? 'day' : 'night';
  const candidates = ops.rates.filter(r=>r.enabled&&!r.archived&&r.categoryId===category.id&&r[period]!=null&&rateMatches(r,origin.id,destination.id));
  // Conflict validation forbids equal-priority rules. Sorting remains stable
  // for historical/corrupt snapshots and never depends on array insertion.
  candidates.sort((a,b)=>(a.kind==='fixed'?0:1)-(b.kind==='fixed'?0:1)||a.id.localeCompare(b.id));
  const rule = candidates[0];
  if (!rule) throw new PricingError('UNKNOWN_ROUTE','Esta opção está indisponível: ainda não há tarifa válida para este trajeto e horário.');
  const pricing = rule[period]!;
  let amount = pricing.amountCents;
  if (rule.kind === 'distance') {
    const distance = request.tripDistanceKm;
    if (distance == null || !Number.isFinite(distance) || distance < 0 || distance > 5000)
      throw new PricingError('MISSING_DISTANCE','É necessária uma distância de rota válida calculada pelo servidor.');
    amount = Math.max(pricing.minimumCents,Math.round(pricing.amountCents*distance));
  }
  amount += Math.max(0,passengers-rule.includedPassengers)*rule.perExtraPassengerCents;
  amount += rule.extras.filter(e=>e.period==='all'||e.period===request.period).reduce((sum,e)=>sum+e.amountCents,0);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000)
    throw new PricingError('UNKNOWN_ROUTE','A configuração da tarifa precisa ser revisada.');
  const split = splitCommission(amount,catalog.commissionBps);
  return {kind:'exact',ruleId:rule.id,baseAmountCents:amount,pickupCompensationCents:0,totalAmountCents:amount,
    platformCommissionCents:split.platformCommissionCents,driverNetCents:split.driverNetCents};
}

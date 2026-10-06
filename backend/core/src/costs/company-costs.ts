import { InvalidAdminRequestError } from '../admin/admin-validation.js';

export type CostBasis = 'monthly' | 'ride' | 'pix_payment' | 'card_payment' | 'commission_percent';
export interface CostData {
  name: string; category: string; slot: string; notes: string;
  certainty: 'confirmed' | 'estimated'; amountCents: number;
  occurredOn?: string; rideId?: string | null; paymentId?: string | null; voided?: boolean; ruleId?: string | null;
  basis?: CostBasis; rateBps?: number; startsOn?: string; endsOn?: string | null;
}
export interface CostItem { id: string; kind: 'expense' | 'rule'; data: CostData; createdAt: string; updatedAt: string }
export interface CostEvent {
  id: string; kind: string; at: string; rideId?: string; paymentId?: string;
  commissionCents: number; feeRecoveryCents: number; otherRevenueCents: number;
  promotionCents: number; adjustmentCents: number;
}
export interface CostPayment { id: string; rideId: string; method: string; at: string; amountCents: number }
export interface CostSource { items: CostItem[]; events: CostEvent[]; payments: CostPayment[] }
export class CostConflictError extends Error {}

export function localDate(at: string | Date): string {
  return new Date(new Date(at).getTime() - 3 * 3600000).toISOString().slice(0, 10);
}
export function dateValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new InvalidAdminRequestError(`${field}: informe uma data válida.`);
  }
  return value;
}
export function reportPeriod(from?: string | null, to?: string | null, now = new Date()) {
  const today = localDate(now);
  const first = dateValue(from || today.slice(0, 8) + '01', 'Início');
  const last = dateValue(to || today, 'Fim');
  if (last < first || Date.parse(last) - Date.parse(first) > 366 * 86400000) {
    throw new InvalidAdminRequestError('Escolha um intervalo de até 367 dias, com início antes do fim.');
  }
  return { from: first, to: last, start: `${first}T03:00:00.000Z`,
    end: new Date(Date.parse(`${last}T03:00:00.000Z`) + 86400000).toISOString() };
}
function textValue(value: unknown, field: string, max: number, optional = false): string {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new InvalidAdminRequestError(`${field}: texto obrigatório, até ${max} caracteres.`);
  }
  return value.trim();
}
export function uuidValue(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new InvalidAdminRequestError('Identificador inválido.');
  }
  return value.toLowerCase();
}
export function parseCostData(raw: unknown, kind: CostItem['kind']): CostData {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) throw new InvalidAdminRequestError('Custo inválido.');
  const r = raw as Record<string, unknown>;
  const allowed = ['name','category','slot','notes','certainty','amountCents',
    ...(kind === 'expense' ? ['occurredOn','rideId','paymentId','voided','ruleId'] : ['basis','rateBps','startsOn','endsOn'])];
  if (Object.keys(r).some(k => !allowed.includes(k))) throw new InvalidAdminRequestError('Campo não reconhecido no custo.');
  if (r.certainty !== 'confirmed' && r.certainty !== 'estimated') throw new InvalidAdminRequestError('Escolha confirmado ou estimado.');
  if (!Number.isSafeInteger(r.amountCents) || Number(r.amountCents) < 0 || Number(r.amountCents) > 1000000000) throw new InvalidAdminRequestError('Valor inválido em centavos.');
  const slot = textValue(r.slot, 'Tipo de custo', 50);
  if (!/^[a-z][a-z0-9_-]*$/.test(slot)) throw new InvalidAdminRequestError('Tipo de custo: use letras sem acento, números e sublinhado.');
  if (['promotion','external_adjustment'].includes(slot)) throw new InvalidAdminRequestError('Esse custo já vem automaticamente do ledger.');
  const data: CostData = { name: textValue(r.name, 'Nome', 100), category: textValue(r.category, 'Categoria', 60),
    notes: textValue(r.notes, 'Observação', 500, true), slot, certainty: r.certainty, amountCents: Number(r.amountCents) };
  if (kind === 'expense') {
    if (data.amountCents <= 0) throw new InvalidAdminRequestError('Despesa deve ser maior que zero.');
    data.occurredOn = dateValue(r.occurredOn, 'Data');
    data.rideId = r.rideId ? uuidValue(r.rideId) : null;
    data.paymentId = r.paymentId ? uuidValue(r.paymentId) : null;
    data.ruleId = r.ruleId ? uuidValue(r.ruleId) : null;
    if(data.ruleId && (data.rideId || data.paymentId)) throw new InvalidAdminRequestError('Vincule a uma regra mensal ou a uma operação, não aos dois.');
    if (r.voided != null && typeof r.voided !== 'boolean') throw new InvalidAdminRequestError('Cancelamento inválido.');
    data.voided = r.voided === true;
    if ((slot === 'processing_fee') && !data.paymentId) throw new InvalidAdminRequestError('Para confirmar uma taxa de pagamento, informe o ID do pagamento. Use outro tipo para uma fatura agregada.');
  } else {
    if (!['monthly','ride','pix_payment','card_payment','commission_percent'].includes(String(r.basis))) throw new InvalidAdminRequestError('Regra de recorrência inválida.');
    data.basis = r.basis as CostBasis;
    data.startsOn = dateValue(r.startsOn, 'Início da regra');
    data.endsOn = r.endsOn ? dateValue(r.endsOn, 'Fim da regra') : null;
    if (data.endsOn && data.endsOn < data.startsOn) throw new InvalidAdminRequestError('Fim da regra anterior ao início.');
    if (!Number.isSafeInteger(r.rateBps) || Number(r.rateBps) < 0 || Number(r.rateBps) > 10000) throw new InvalidAdminRequestError('Percentual deve ficar entre 0 e 100%.');
    data.rateBps = Number(r.rateBps);
    const paymentBasis=['pix_payment','card_payment'].includes(data.basis);
    if (paymentBasis ? data.amountCents===0 && data.rateBps===0 : data.basis === 'commission_percent' ? data.rateBps === 0 || data.amountCents !== 0 : data.amountCents === 0 || data.rateBps !== 0) throw new InvalidAdminRequestError('Informe valor fixo ou percentual conforme a regra.');
    // Tarifas por operação são projeções; valor confirmado vem da despesa vinculada.
    if (data.basis !== 'monthly') data.certainty = 'estimated';
  }
  return data;
}
export function createCostItem(kind: CostItem['kind'], raw: unknown, id: string, now = new Date()): CostItem {
  return { id: uuidValue(id), kind, data: parseCostData(raw,kind), createdAt: now.toISOString(), updatedAt: now.toISOString() };
}

interface CostLine { key: string; name: string; category: string; slot: string; amountCents: number;
  certainty: 'confirmed' | 'estimated'; date: string; source: string; rideId?: string; paymentId?: string; ruleId?: string }
export function calculateCostReport(source: CostSource, period: ReturnType<typeof reportPeriod>) {
  const inside = (date: string) => date >= period.from && date <= period.to;
  const rows = new Map<string,CostLine>();
  let commissionCents = 0, otherRevenueCents = 0, feeRecoveryCents = 0;
  const events = source.events.filter(e => inside(localDate(e.at)));
  for (const e of events) {
    commissionCents += e.commissionCents;
    otherRevenueCents += e.otherRevenueCents;
    feeRecoveryCents += e.feeRecoveryCents;
    for (const [slot,value,name,category,certainty] of [
      ['promotion',e.promotionCents,'Cupons financiados pela empresa','Cupons','confirmed'],
      ['external_adjustment',e.adjustmentCents,'Ajuste externo em revisão','Ajustes','estimated'],
    ] as const) if (value !== 0) rows.set(`ledger:${e.id}:${slot}`, { key:`ledger:${e.id}:${slot}`,slot,
      name,category,amountCents:value,certainty,date:localDate(e.at),source:'ledger',...(e.rideId ? {rideId:e.rideId}: {}) });
  }
  const payments = source.payments.filter(p => inside(localDate(p.at)));
  const isActive = (d: CostData, date: string) => date >= d.startsOn! && (!d.endsOn || date <= d.endsOn);
  const overrides = new Set(source.items.filter(i=>i.kind==='expense' && !i.data.voided).map(i=>i.data.paymentId ? `payment:${i.data.paymentId}:${i.data.slot}` : i.data.ruleId ? `month:${i.data.ruleId}:${i.data.occurredOn!.slice(0,7)}` : i.data.rideId ? `ride:${i.data.rideId}:${i.data.slot}` : `expense:${i.id}`));
  for (const rule of source.items.filter(i => i.kind === 'rule')) {
    const d = rule.data;
    const add = (key:string,date:string,amount:number,rideId?:string,paymentId?:string) => {
      if(overrides.has(key)) return;
      const line: CostLine = {key,name:d.name,category:d.category,slot:d.slot,amountCents:amount,certainty:d.certainty,date,source:'rule',ruleId:rule.id,
        ...(rideId ? {rideId}: {}),...(paymentId ? {paymentId}: {})};
      // Overlapping tariffs must be rejected on write, never added twice.
      if (rows.has(key)) throw new CostConflictError('Regras sobrepostas. Encerre a regra anterior antes de criar outra para o mesmo tipo.');
      if (amount > 0) rows.set(key,line);
    };
    if (d.basis === 'monthly') {
      const anchorDay = Number(d.startsOn!.slice(8));
      let month = period.from.slice(0,7);
      while (month <= period.to.slice(0,7)) {
        const [year,m] = month.split('-').map(Number) as [number,number];
        const day = Math.min(anchorDay,new Date(Date.UTC(year,m,0)).getUTCDate());
        const date = `${month}-${String(day).padStart(2,'0')}`;
        if (inside(date) && isActive(d,date)) add(`month:${rule.id}:${month}`,date,d.amountCents);
        month = new Date(Date.UTC(year,m,1)).toISOString().slice(0,7);
      }
    } else if (d.basis === 'pix_payment' || d.basis === 'card_payment') {
      for (const p of payments) if (p.method === (d.basis === 'pix_payment' ? 'pix':'card') && isActive(d,localDate(p.at)))
        add(`payment:${p.id}:${d.slot}`,localDate(p.at),d.amountCents+Math.round(p.amountCents*d.rateBps!/10000),p.rideId,p.id);
    } else {
      for (const e of events) if (['RIDE_SETTLED','CASH_RIDE_COMMISSION_ACCRUED'].includes(e.kind) && isActive(d,localDate(e.at)))
        add(`ride:${e.rideId}:${d.slot}`,localDate(e.at),d.basis === 'ride' ? d.amountCents : Math.round(e.commissionCents*d.rateBps!/10000),e.rideId);
    }
  }
  // A confirmed expense replaces an estimate for the same payment/ride and slot.
  for (const item of source.items.filter(i => i.kind === 'expense' && !i.data.voided)) {
    const d = item.data;
    if (!inside(d.occurredOn!)) continue;
    const key = d.paymentId ? `payment:${d.paymentId}:${d.slot}` : d.ruleId ? `month:${d.ruleId}:${d.occurredOn!.slice(0,7)}` : d.rideId ? `ride:${d.rideId}:${d.slot}` : `expense:${item.id}`;
    rows.set(key,{key,name:d.name,category:d.category,slot:d.slot,amountCents:d.amountCents,certainty:d.certainty,date:d.occurredOn!,source:'expense',
      ...(d.rideId ? {rideId:d.rideId}: {}),...(d.paymentId ? {paymentId:d.paymentId}: {})});
  }
  const lines = [...rows.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.key.localeCompare(b.key));
  const confirmedCostsCents = lines.filter(r=>r.certainty==='confirmed').reduce((s,r)=>s+r.amountCents,0);
  const estimatedCostsCents = lines.filter(r=>r.certainty==='estimated').reduce((s,r)=>s+r.amountCents,0);
  const totalRevenueCents = commissionCents+otherRevenueCents+feeRecoveryCents;
  const categories: Record<string,number> = Object.create(null);
  for (const l of lines) categories[l.category]=(categories[l.category]??0)+l.amountCents;
  const rides = new Map<string,{rideId:string,commissionCents:number,costsCents:number,netCents:number}>();
  for(const e of events) if(e.rideId && ['RIDE_SETTLED','CASH_RIDE_COMMISSION_ACCRUED'].includes(e.kind)) {
    const row=rides.get(e.rideId)??{rideId:e.rideId,commissionCents:0,costsCents:0,netCents:0};row.commissionCents+=e.commissionCents+e.feeRecoveryCents;rides.set(e.rideId,row);
  }
  for(const l of lines) if(l.rideId && rides.has(l.rideId)) rides.get(l.rideId)!.costsCents+=l.amountCents;
  for(const r of rides.values()) r.netCents=r.commissionCents-r.costsCents;
  return { period:{from:period.from,to:period.to,timeZone:'America/Fortaleza'},generatedAt:new Date().toISOString(),
    summary:{commissionCents,otherRevenueCents,feeRecoveryCents,totalRevenueCents,confirmedCostsCents,estimatedCostsCents,
      resultConfirmedCents:totalRevenueCents-confirmedCostsCents,projectedNetCents:totalRevenueCents-confirmedCostsCents-estimatedCostsCents},
    categories:Object.entries(categories).map(([category,amountCents])=>({category,amountCents})),
    lines:lines.slice(0,500),lineCount:lines.length,rides:[...rides.values()].slice(0,500),rideCount:rides.size,items:source.items,
    note:'Resultado gerencial dos custos registrados. Estimativas não são cobranças verificadas. Não equivale ao saldo disponível para saque. Custos fixos não são rateados por corrida.' };
}

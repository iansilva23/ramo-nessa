import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { calculateCostReport, createCostItem, dateValue, localDate, parseCostData, reportPeriod, type CostSource, type CostEvent } from '../src/costs/company-costs.js';
import { InMemoryCompanyCostRepository, costEvent } from '../src/costs/company-cost-repository.js';
import { InMemoryAdminRepository } from '../src/admin/repositories/in-memory-admin-repository.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
const day='2026-10-06',at=day+'T12:00:00.000Z',rideId=randomUUID(),paymentId=randomUUID();
const period=reportPeriod(day,day);
const rule=(basis='pix_payment',amountCents=99,rateBps=0,slot='processing_fee',startsOn=day)=>createCostItem('rule',{
  name:'Taxa',category:'Pagamentos',slot,basis,amountCents,rateBps,certainty:'estimated',startsOn,endsOn:null,notes:''},randomUUID());
const expense=(amountCents=99,extra:object={})=>createCostItem('expense',{name:'Custo confirmado',category:'Pagamentos',slot:'processing_fee',
  amountCents,certainty:'confirmed',occurredOn:day,paymentId,rideId,notes:'',...extra},randomUUID());
const event=(extra:Partial<CostEvent>={})=>({id:randomUUID(),kind:'RIDE_SETTLED',at,rideId,paymentId,commissionCents:500,
  feeRecoveryCents:0,otherRevenueCents:0,promotionCents:0,adjustmentCents:0,...extra});
const source=():CostSource=>({items:[rule()],events:[event()],payments:[{id:paymentId,rideId,method:'pix',at,amountCents:5000}]});
test('R$50 de corrida deixa R$4,01 dos 10% após Pix de R$0,99 estimado',()=>{
  const r=calculateCostReport(source(),period);assert.equal(r.summary.commissionCents,500);assert.equal(r.summary.estimatedCostsCents,99);
  assert.equal(r.summary.projectedNetCents,401);assert.equal(r.summary.resultConfirmedCents,500);assert.equal(r.rides[0]!.netCents,401);
});
test('custo real substitui estimativa por pagamento e não soma duas taxas',()=>{
  const s=source();s.items.push(expense(120));const r=calculateCostReport(s,period);
  assert.equal(r.summary.confirmedCostsCents,120);assert.equal(r.summary.estimatedCostsCents,0);assert.equal(r.lines.length,1);assert.equal(r.summary.projectedNetCents,380);
});
test('confirmação em data posterior não deixa estimativa duplicada no dia da captura',()=>{
  const s=source();s.items.push(expense(120,{occurredOn:'2026-10-07'}));
  assert.equal(calculateCostReport(s,period).summary.estimatedCostsCents,0);
  assert.equal(calculateCostReport(s,reportPeriod('2026-10-07','2026-10-07')).summary.confirmedCostsCents,120);
});
test('pagamento recebido mas estornado mantém custo do recebimento, sem reconhecer comissão fictícia',()=>{
  const s=source();s.events=[];const r=calculateCostReport(s,period);
  assert.equal(r.summary.commissionCents,0);assert.equal(r.summary.projectedNetCents,-99);
});
test('regra percentual de cartão usa valor recebido e não comissão, arredonda em centavos',()=>{
  const s=source();s.items=[rule('card_payment',10,498)];s.payments[0]!.method='card';s.payments[0]!.amountCents=5099;
  assert.equal(calculateCostReport(s,period).summary.estimatedCostsCents,264);
});
test('regra percentual sobre comissão não inclui dinheiro do motorista',()=>{
  const s=source();s.items=[rule('commission_percent',0,600,'tax')];
  assert.equal(calculateCostReport(s,period).summary.estimatedCostsCents,30);
});
test('conta despesas, reversão de cupom e ajustes em revisão separadamente',()=>{
  const s=source();s.items=[];s.events.push(event({commissionCents:0,promotionCents:100,kind:'RIDE_PROMOTION_FUNDED'}),event({commissionCents:0,promotionCents:-40,kind:'RIDE_PROMOTION_REVERSED'}),event({commissionCents:0,adjustmentCents:70,kind:'EXTERNAL_PAYMENT_ADJUSTED'}));
  const r=calculateCostReport(s,period);assert.equal(r.summary.confirmedCostsCents,60);assert.equal(r.summary.estimatedCostsCents,70);assert.equal(r.summary.projectedNetCents,370);
});
test('retirada do proprietário não é custo nem reduz receita gerencial',()=>{
  const e=costEvent({id:randomUUID(),kind:'COMPANY_PAYOUT_RESERVED',companyPayoutId:randomUUID(),createdAt:at,referenceKey:'payout',entries:[{accountKey:'platform:revenue',direction:'debit',amountCents:500}]});
  assert.equal(e.otherRevenueCents,0);assert.equal(e.commissionCents,0);
});
test('receita de antecipação e acréscimos de pagamento ficam separados da comissão',()=>{
  const s=source();s.items=[];s.events.push(event({kind:'DRIVER_PAYOUT_RESERVED',commissionCents:0,otherRevenueCents:1000,feeRecoveryCents:99}));
  const r=calculateCostReport(s,period);assert.equal(r.summary.totalRevenueCents,1599);assert.equal(r.summary.commissionCents,500);
});
test('mensalidade ancorada em dia31 vence dia28 em fevereiro, sem duplicar dias do intervalo',()=>{
  const r=rule('monthly',5000,0,'server','2026-01-31');
  const s={items:[r],events:[],payments:[]};
  assert.equal(calculateCostReport(s,reportPeriod('2026-02-01','2026-02-28')).summary.estimatedCostsCents,5000);
  assert.equal(calculateCostReport(s,reportPeriod('2026-02-01','2026-02-27')).summary.estimatedCostsCents,0);
  assert.equal(calculateCostReport(s,reportPeriod('2026-01-01','2026-03-31')).summary.estimatedCostsCents,15000);
});
test('despesa mensal vinculada substitui previsão, custo fixo não é alocado à corrida',()=>{
  const s=source(),r=rule('monthly',6000,0,'server');s.items=[r,expense(6500,{slot:'server',ruleId:r.id,paymentId:null,rideId:null})];
  const result=calculateCostReport(s,period);assert.equal(result.summary.confirmedCostsCents,6500);assert.equal(result.summary.estimatedCostsCents,0);assert.equal(result.rides[0]!.netCents,500);
});
test('datas de Fortaleza, limites inválidos e intervalos muito grandes',()=>{
  assert.equal(localDate('2026-10-07T02:59:59Z'),day);assert.equal(localDate('2026-10-07T03:00:00Z'),'2026-10-07');
  assert.equal(period.start,day+'T03:00:00.000Z');assert.equal(period.end,'2026-10-07T03:00:00.000Z');
  assert.throws(()=>dateValue('2026-02-30','Data'));assert.throws(()=>reportPeriod('2026-10-08',day));assert.throws(()=>reportPeriod('2024-01-01',day));
});
test('despesa cancelada é preservada mas não entra no resultado',()=>{
  const s=source();s.items=[expense(99,{voided:true})];const r=calculateCostReport(s,period);assert.equal(r.summary.confirmedCostsCents,0);assert.equal(r.items.length,1);
});
test('custo com carteira não é taxa Pix; não existe tarifa por solicitação pendente',()=>{
  const s=source();s.payments[0]!.method='wallet';assert.equal(calculateCostReport(s,period).summary.estimatedCostsCents,0);
});
test('regras respeitam vigência e tarifas antigas antes de data de mudança',()=>{
  const s=source(),old=rule();old.data.endsOn=day;const next=rule('pix_payment',150,0,'processing_fee','2026-10-07');s.items=[old,next];
  assert.equal(calculateCostReport(s,period).summary.estimatedCostsCents,99);
  s.payments[0]!.at='2026-10-07T12:00:00Z';assert.equal(calculateCostReport(s,reportPeriod('2026-10-07','2026-10-07')).summary.estimatedCostsCents,150);
});
test('validação rejeita valor fracionário, custo de ledger manual, IDs e campos inesperados',()=>{
  const data=expense().data;
  for(const change of [{amountCents:1.2},{amountCents:-1},{slot:'promotion'},{paymentId:'bad'},{unrelated:1},{ruleId:randomUUID()}])assert.throws(()=>parseCostData({...data,...change},'expense'));
});
test('criação idempotente, auditoria, edição concorrente e bloqueio de regras sobrepostas',async()=>{
  const admin=new InMemoryAdminRepository(),repo=new InMemoryCompanyCostRepository(new InMemoryFinanceRepository(),admin),actor={kind:'api_key' as const,id:randomUUID(),name:'Owner'};
  const r=rule();await repo.save(r,actor);await repo.save({...r,data:{...r.data}},actor);assert.equal((await admin.listAudit(100)).length,1);
  await assert.rejects(()=>repo.save(rule(),actor),/Já existe/);
  await assert.rejects(()=>repo.save({...r,data:{...r.data,amountCents:100}},actor,r.updatedAt),/Encerre/);
  const changed=await repo.save({...r,data:{...r.data,endsOn:day}},actor,r.updatedAt);assert.notEqual(changed.updatedAt,r.updatedAt);
  await assert.rejects(()=>repo.save(r,actor,r.updatedAt),/outra pessoa/);
});
test('somatórios não usam apenas primeiras500 linhas',()=>{
  const s=source();s.items=Array.from({length:501},()=>expense(100,{slot:'general',paymentId:null,rideId:null}));
  const r=calculateCostReport(s,period);assert.equal(r.lines.length,500);assert.equal(r.lineCount,501);assert.equal(r.summary.confirmedCostsCents,50100);
});

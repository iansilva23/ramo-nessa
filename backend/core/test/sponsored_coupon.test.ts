import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { InMemoryPromotionRepository } from '../src/promotions/repositories/in-memory-promotion-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { createPromotionCampaignRecord, applyPromotionToRide, removePromotionFromRide } from '../src/promotions/promotion-service.js';
import { parseAdminPromotion } from '../src/admin/admin-promotions-service.js';
import { driverOfferView } from '../src/drivers/driver-app-service.js';
import { driverRideView } from '../src/drivers/driver-ride-service.js';
import { driverPromotionPresentation, parsePromotionPresentation } from '../src/promotions/promotion-presentation.js';
import { createPostgresPool } from '../src/db/postgres.js';
import { PostgresPromotionRepository } from '../src/promotions/repositories/postgres-promotion-repository.js';
import { PostgresRideRepository } from '../src/rides/repositories/postgres-ride-repository.js';
import type { RideRecord } from '../src/rides/ride.js';
import type { PromotionRepository } from '../src/promotions/promotion-repository.js';
import type { RideRepository } from '../src/rides/ride-repository.js';

const now = new Date('2026-10-28T00:00:00Z');
const presentation = {tag:'influencer', partnerName:'Parceiro', message:'📸 Bem-vindo à campanha com {nome}!', animation:'flash'} as const;
function ride(): RideRecord {
  return {id:randomUUID(), passengerId:randomUUID(), state:'AWAITING_PAYMENT', paymentStatus:'created',
    origin:{zoneId:'prea'}, destination:{zoneId:'jijoca'}, category:'car', period:'day', passengers:1,
    quote:{ruleId:'normal',baseAmountCents:2000,pickupCompensationCents:0,totalAmountCents:2000,platformCommissionCents:400,driverNetCents:1600},
    createdAt:now.toISOString(), updatedAt:now.toISOString()};
}

test('Empresa paga com teto mantém preço normal e ganho, tags não vazam nome/mensagem antes do aceite', async () => {
  const promotions = new InMemoryPromotionRepository(), rides = new InMemoryRideRepository();
  const campaign = await promotions.createCampaign(parseAdminPromotion({code:'EMPRESA',name:'Campanha empresa',kind:'company_paid',
    maxDiscountCents:1500, budgetCents:3000, maxRedemptions:10, enabled:true, driverPresentation:presentation}));
  const original = await rides.create(ride());
  const promoted = await applyPromotionToRide({promotions,rides,rideId:original.id,passengerId:original.passengerId,code:campaign.code,
    clientInstanceId:'sponsored-coupon-device-0123456789',now});
  assert.deepEqual(promoted.quote, original.quote);
  assert.equal(promoted.promotion!.passengerPayableCents,500);
  assert.equal(promoted.promotion!.driverEarningsCents,1600);
  const offer = driverOfferView({id:randomUUID(),rideId:promoted.id,expiresAt:now.toISOString(),approximatePickupDistanceKm:1},promoted);
  assert.equal(offer.driverEarningsCents,1600);
  assert.deepEqual(offer.campaignPresentation,{tag:'influencer',label:'Influenciador parceiro'});
  const accepted = driverRideView(promoted).campaignPresentation;
  assert.equal(accepted && 'partnerName' in accepted ? accepted.partnerName : null,'Parceiro');
  assert.equal(accepted && 'message' in accepted ? accepted.message : null,'📸 Bem-vindo à campanha com Parceiro!');
  const updated = await promotions.updateCampaignPresentation(campaign.id,{...presentation,partnerName:'Outro'},campaign.updatedAt,new Date(now.getTime()+1000).toISOString());
  assert.equal(updated.driverPresentation?.partnerName,'Outro');
  assert.equal((await rides.findById(promoted.id))!.promotion!.driverPresentation!.partnerName,'Parceiro');
  await assert.rejects(promotions.updateCampaignPresentation(campaign.id,undefined,campaign.updatedAt,now.toISOString()));
  const removed = await removePromotionFromRide({promotions,rides,rideId:promoted.id,passengerId:promoted.passengerId,now});
  assert.equal(removed.promotion,undefined); assert.deepEqual(removed.quote,original.quote);
});

test('novos campos não mudam modalidades antigas e apresentação é texto limitado', () => {
  for (const kind of ['wallet_credit','fixed_discount','percent_discount','free_ride','fixed_driver_fare'] as const) {
    const campaign = createPromotionCampaignRecord({code:'ANTIGO',name:'Cupom antigo',kind,valueCents:500,percentBps:1000,
      fixedDriverFareCents:1000,maxRedemptions:10});
    assert.equal(campaign.driverPresentation,undefined); assert.equal(campaign.budgetCents,undefined);
  }
  assert.equal(parsePromotionPresentation(null),undefined);
  assert.throws(()=>parsePromotionPresentation({...presentation,message:'x'.repeat(321)}));
  assert.throws(()=>parsePromotionPresentation({...presentation,animation:'fullscreen'}));
  assert.throws(()=>parsePromotionPresentation({...presentation,priority:true}));
  assert.equal(driverPromotionPresentation(undefined,false),undefined);
  assert.throws(()=>parseAdminPromotion({code:'TESTE',name:'Teste',kind:'company_paid',valueCents:100,maxRedemptions:1}));
});

async function budgetScenario(promotions: PromotionRepository, rides: RideRepository) {
  const campaign = await promotions.createCampaign(createPromotionCampaignRecord({code:'B'+randomUUID().replaceAll('-','').slice(0,20),
    name:'Orçamento concorrente',kind:'company_paid',budgetCents:2000,maxRedemptions:20,enabled:true,now}));
  const candidates = await Promise.all(Array.from({length:4},()=>rides.create(ride())));
  const apply = (candidate:RideRecord) => applyPromotionToRide({promotions,rides,rideId:candidate.id,passengerId:candidate.passengerId,
    code:campaign.code,clientInstanceId:'budget-device-'+candidate.id,now});
  const results = await Promise.allSettled(candidates.map(apply));
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
  for (const result of results) if(result.status==='rejected') assert.equal(result.reason.code,'PROMOTION_BUDGET_REACHED');
  const success = results.find(item=>item.status==='fulfilled')!;
  if(success.status!=='fulfilled') throw Error('Reserva esperada');
  const redemption = success.value.promotion!.applicationId;
  await promotions.setRedemptionStatus(redemption,'released',now.toISOString());
  const next = await apply(candidates.find(item=>item.id!==success.value.id)!);
  assert.equal(next.promotion!.discountCents,2000);
  await assert.rejects(promotions.setRedemptionStatus(redemption,'reserved',now.toISOString()),{code:'PROMOTION_BUDGET_REACHED'});
  return {campaign,candidates};
}
test('orçamento reserva concorrente, libera ao cancelar e bloqueia restauração sem saldo',async()=>{
  await budgetScenario(new InMemoryPromotionRepository(),new InMemoryRideRepository());
});
test('PostgreSQL serializa orçamento e persiste apresentação editável sem alterar corridas antigas', {skip:!process.env.DATABASE_URL}, async()=>{
  const pool = createPostgresPool(process.env.DATABASE_URL!);
  try {
    const promotions = new PostgresPromotionRepository(pool), rides = new PostgresRideRepository(pool);
    const {campaign,candidates} = await budgetScenario(promotions,rides);
    const edited = await promotions.updateCampaignPresentation(campaign.id,presentation,campaign.updatedAt,new Date(now.getTime()+1000).toISOString());
    assert.deepEqual((await promotions.findCampaignById(campaign.id))?.driverPresentation,presentation);
    await assert.rejects(promotions.updateCampaignPresentation(campaign.id,undefined,campaign.updatedAt,now.toISOString()));
    await promotions.updateCampaignPresentation(campaign.id,undefined,edited.updatedAt,new Date(now.getTime()+2000).toISOString());
    assert.equal((await promotions.findCampaignById(campaign.id))?.driverPresentation,undefined);
    await pool.query('DELETE FROM promotion_redemptions WHERE campaign_id=$1',[campaign.id]);
    await pool.query('DELETE FROM rides WHERE id=ANY($1::uuid[])',[candidates.map(item=>item.id)]);
    await pool.query('DELETE FROM promotion_campaigns WHERE id=$1',[campaign.id]);
  } finally {await pool.end();}
});

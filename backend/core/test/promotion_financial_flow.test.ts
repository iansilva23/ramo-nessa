import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { InMemoryPromotionRepository } from '../src/promotions/repositories/in-memory-promotion-repository.js';
import {
  applyPromotionToRide, createPromotionCampaignRecord, createFullyPromotionalPayment,
  fundRidePromotion, redeemRidePromotion, savePassengerPromotionPreference,
} from '../src/promotions/promotion-service.js';
import { PromotionRepositoryError, type PromotionKind } from '../src/promotions/promotion-repository.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { createWalletTopup, payRideWithWallet } from '../src/payments/wallet-services.js';
import { confirmRidePayment } from '../src/rides/confirm-payment.js';
import { settleCompletedRide } from '../src/payments/settlement.js';
import { automaticallyRefundRide } from '../src/rides/automatic-ride-refund-service.js';
import { transitionRide } from '../src/rides/ride-state.js';
import { InMemoryDriverSupplyRepository } from '../src/drivers/repositories/in-memory-driver-supply-repository.js';
import { InMemoryRideMatchingRepository } from '../src/matching/in-memory-ride-matching-repository.js';
import { dispatchRideAfterPayment } from '../src/rides/dispatch-after-payment.js';
import { acceptDriverOffer } from '../src/matching/offer-service.js';
import { driverOfferView } from '../src/drivers/driver-app-service.js';
import type { RideRecord } from '../src/rides/ride.js';
import { expireNoDriverDecisions } from '../src/rides/no-driver-decision-timeout-service.js';
import { InMemoryOperationalSettingsRepository } from '../src/config/in-memory-operational-settings-repository.js';
import { MercadoPagoOrdersClient } from '../src/payments/mercado-pago-orders.js';
import { applyMercadoPagoOrderStatus, createMercadoPagoCardIntent, createMercadoPagoPixIntent } from '../src/payments/mercado-pago-payment-service.js';

const now = new Date('2026-10-01T05:00:00.000Z');
const device = 'financial-coupon-device-0123456789abcdef';
const cases = [
  { kind: 'fixed_discount', payable: 15000, subsidy: 5000, driver: 18000, commission: 2000 },
  { kind: 'percent_discount', payable: 17000, subsidy: 3000, driver: 18000, commission: 2000 },
  { kind: 'free_ride', payable: 0, subsidy: 20000, driver: 18000, commission: 2000 },
  { kind: 'fixed_driver_fare', payable: 5000, subsidy: 0, driver: 5000, commission: 0 },
] as const;

function normalRide(passengerId = 'audit-passenger'): RideRecord {
  return {
    id: randomUUID(), passengerId, state: 'AWAITING_PAYMENT', paymentStatus: 'created',
    reservedDriverId: 'audit-driver', driverHoldExpiresAt: '2026-10-01T05:05:00.000Z',
    pickupLatitude: -2.8, pickupLongitude: -40.4, dropoffLatitude: -2.9, dropoffLongitude: -40.5,
    origin: { zoneId: 'prea' }, destination: { zoneId: 'jijoca' }, category: 'car',
    period: 'day', passengers: 1,
    quote: {
      ruleId: 'audit-normal', baseAmountCents: 20000, pickupCompensationCents: 0,
      totalAmountCents: 20000, platformCommissionCents: 2000, driverNetCents: 18000,
    }, createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
}

async function setup(kind: PromotionKind, maxRedemptions = 10) {
  const promotions = new InMemoryPromotionRepository();
  const rides = new InMemoryRideRepository();
  const finance = new InMemoryFinanceRepository();
  const campaign = await promotions.createCampaign(createPromotionCampaignRecord({
    code: 'AUDIT50', name: 'Financial flow audit', kind,
    ...(kind === 'fixed_discount' ? { valueCents: 5000 } : {}),
    ...(kind === 'percent_discount' ? { percentBps: 2500, maxDiscountCents: 3000 } : {}),
    ...(kind === 'fixed_driver_fare' ? { fixedDriverFareCents: 5000 } : {}),
    categories: ['car'], maxRedemptions, perPassengerLimit: 10, perDeviceLimit: 10, enabled: true, now,
  }));
  const normal = await rides.create(normalRide());
  await savePassengerPromotionPreference({
    promotions, passengerId: normal.passengerId, clientInstanceId: device, code: campaign.code, now,
  });
  const ride = await applyPromotionToRide({
    promotions, rides, rideId: normal.id, passengerId: normal.passengerId,
    clientInstanceId: device, now,
  });
  const topup = await createWalletTopup(finance, {
    passengerId: ride.passengerId, method: 'pix', processor: 'audit-gateway',
    amountCents: 50000, idempotencyKey: `topup-${ride.id}`, now,
  });
  await finance.captureWalletTopup({walletTopupId: topup.id, processorEventId: `capture-${topup.id}`, capturedAt: now});
  return { promotions, rides, finance, ride, campaign };
}

async function pay(context: Awaited<ReturnType<typeof setup>>) {
  const { finance, ride, rides, promotions } = context;
  const payment = ride.promotion!.passengerPayableCents === 0
    ? await createFullyPromotionalPayment({finance, ride, now})
    : (await payRideWithWallet(finance, {
      ride, passengerId: ride.passengerId, idempotencyKey: `pay-${ride.id}`, now,
    })).payment;
  await Promise.all(Array.from({length: 4}, () => fundRidePromotion({finance, promotions, ride, now})));
  const paid = await confirmRidePayment(rides, {rideId: ride.id, payment, confirmedAt: now});
  return { payment, paid };
}

for (const scenario of cases) {
  test(`${scenario.kind}: perfil até oferta, aceite e liquidação idempotente`, async () => {
    const context = await setup(scenario.kind);
    const { promotions, rides, finance, ride } = context;
    assert.equal(ride.promotion!.passengerPayableCents, scenario.payable);
    const { payment, paid } = await pay(context);
    assert.equal(payment.amountCents, scenario.payable);
    if (scenario.payable === 0) {
      assert.equal(payment.method, 'promotion');
      assert.equal(payment.processor, 'internal-promotion');
    }
    const drivers = new InMemoryDriverSupplyRepository();
    await drivers.upsert({
      driverId: 'audit-driver', vehicleId: 'audit-vehicle', categories: ['car'],
      fourByFour: false, seatCapacity: 4, online: true, busy: false,
      reservedRideId: ride.id, reservedUntil: ride.driverHoldExpiresAt!,
      latitude: -2.8, longitude: -40.4, locationUpdatedAt: now.toISOString(), updatedAt: now.toISOString(),
    });
    const matching = new InMemoryRideMatchingRepository(rides, drivers);
    const dispatch = await dispatchRideAfterPayment({ride: paid, rides, drivers, matching, now});
    assert.equal(dispatch.kind, 'OFFER_CREATED');
    if (dispatch.kind !== 'OFFER_CREATED') throw new Error('Expected driver offer');
    const offeredRide = (await rides.findById(ride.id))!;
    assert.equal(driverOfferView(dispatch.offer, offeredRide).driverEarningsCents, scenario.driver);
    const accepted = await acceptDriverOffer({
      repository: matching, offerId: dispatch.offer.id, driverId: 'audit-driver',
      now: new Date(now.getTime() + 5000),
    });
    await Promise.all(Array.from({length: 4}, () => redeemRidePromotion({promotions, ride: accepted.ride, now})));
    assert.equal(await promotions.countRedeemed(context.campaign.id), 1);
    let completed = accepted.ride;
    for (const state of ['DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED'] as const) {
      completed = await rides.save({...completed, state: transitionRide(completed.state, state)});
    }
    const first = await settleCompletedRide(finance, {ride: completed, payment});
    const retry = await settleCompletedRide(finance, {ride: completed, payment});
    assert.equal(first.duplicateSettlement, false);
    assert.equal(retry.duplicateSettlement, true);
    assert.equal(await finance.getAccountBalanceCents('driver:audit-driver:payable'), scenario.driver);
    assert.equal(await finance.getAccountBalanceCents('platform:revenue'), scenario.commission);
    assert.equal(await finance.getAccountBalanceCents('platform:promotion_expense'), scenario.subsidy === 0 ? 0 : -scenario.subsidy);
    assert.equal(await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`), 0);
    assert.equal(await finance.getAccountBalanceCents(`passenger:${ride.passengerId}:wallet`), 50000 - scenario.payable);
  });

  test(`${scenario.kind}: cancelamento e retry não duplicam reversão nem deixam escrow`, async () => {
    const context = await setup(scenario.kind);
    const { promotions, rides, finance, ride } = context;
    const { paid } = await pay(context);
    await rides.save({...paid, state: transitionRide(paid.state, 'CANCELLED_BY_PASSENGER')});
    const refund = () => automaticallyRefundRide({
      rides, promotions, finance, gateway: null, rideId: ride.id, passengerId: ride.passengerId, now,
    });
    await refund();
    await refund();
    await fundRidePromotion({
      promotions, finance, ride: (await rides.findById(ride.id))!, now,
    });
    assert.equal(await finance.getAccountBalanceCents(`passenger:${ride.passengerId}:wallet`), 50000);
    assert.equal(await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`), 0);
    assert.equal(await finance.getAccountBalanceCents('platform:promotion_expense'), 0);
    assert.equal((await promotions.findRedemptionById(ride.promotion!.applicationId))?.status, 'released');
    const ledger = await finance.listLedgerTransactionsForAccounts([`ride:${ride.id}:escrow`], 50);
    assert.equal(ledger.filter(item => item.kind === 'RIDE_PROMOTION_FUNDED').length, scenario.subsidy > 0 ? 1 : 0);
    assert.equal(ledger.filter(item => item.kind === 'RIDE_PROMOTION_REVERSED').length, scenario.subsidy > 0 ? 1 : 0);
  });
}

for (const scenario of cases) {
  test(`${scenario.kind}: NO_DRIVER_FOUND abandonado reverte benefício uma vez`, async () => {
    const context = await setup(scenario.kind);
    const { paid } = await pay(context);
    const { rides, finance, promotions, ride } = context;
    const searching = {...paid, state: transitionRide(paid.state, 'SEARCHING_DRIVER')};
    await rides.save({...searching, state: transitionRide(searching.state, 'NO_DRIVER_FOUND')});
    const sweep = () => expireNoDriverDecisions({
      rides, finance, promotions, gateway: null,
      operationalSettings: new InMemoryOperationalSettingsRepository(),
      now: new Date(now.getTime() + 60 * 60 * 1000),
    });
    assert.equal((await sweep()).length, 1);
    assert.equal((await sweep()).length, 0);
    assert.equal(await finance.getAccountBalanceCents(`passenger:${ride.passengerId}:wallet`), 50000);
    assert.equal(await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`), 0);
    assert.equal(await finance.getAccountBalanceCents('platform:promotion_expense'), 0);
    assert.equal((await promotions.findRedemptionById(ride.promotion!.applicationId))?.status, 'released');
  });
}

for (const scenario of cases) test(`${scenario.kind}: corrida paga mantém limite após expirar hold inicial`, async () => {
  const context = await setup(scenario.kind, 1);
  await pay(context);
  const retained = await context.promotions.findRedemptionById(context.ride.promotion!.applicationId);
  assert.equal(retained?.status, 'reserved');
  assert.equal(retained?.expiresAt, undefined);
  const later = new Date(now.getTime() + 6 * 60 * 1000);
  const other = await context.rides.create(normalRide('another-audit-passenger'));
  await assert.rejects(applyPromotionToRide({
    promotions: context.promotions, rides: context.rides, passengerId: other.passengerId,
    rideId: other.id, code: context.campaign.code, clientInstanceId: `${device}-other`, now: later,
  }), (error: unknown) => error instanceof PromotionRepositoryError && error.code === 'PROMOTION_LIMIT_REACHED');
});

for (const invalid of ['expired', 'released', 'wrong-passenger', 'missing'] as const) {
  test(`reserva ${invalid} não permite financiar promoção`, async () => {
    const context = await setup('fixed_discount');
    const { promotions, finance, ride } = context;
    if (invalid === 'released') {
      await promotions.setRedemptionStatus(ride.promotion!.applicationId, 'released', now.toISOString());
    }
    const invalidRide = invalid === 'wrong-passenger'
      ? {...ride, passengerId: 'wrong-audit-passenger'}
      : invalid === 'missing'
      ? {...ride, promotion: {...ride.promotion!, applicationId: randomUUID()}}
      : ride;
    await assert.rejects(fundRidePromotion({
      promotions, finance, ride: invalidRide,
      now: invalid === 'expired' ? new Date(now.getTime() + 6 * 60 * 1000) : now,
    }), (error: unknown) => error instanceof PromotionRepositoryError && error.code === 'PROMOTION_REFERENCE_CONFLICT');
    assert.equal(await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`), 0);
    assert.equal(await finance.getAccountBalanceCents('platform:promotion_expense'), 0);
  });
}

for (const scenario of cases.filter(item => item.kind !== 'free_ride')) {
  for (const method of ['pix', 'card'] as const) {
    test(`${scenario.kind}: ${method} cobra somente restante e estorna sem escrow residual`, async () => {
      const context = await setup(scenario.kind);
      const {rides, promotions, finance, ride} = context;
      let requestedAmount = '';
      let refundCalls = 0;
      let refunded = false;
      const orderId = 'ORD01COUPONAUDIT123456789';
      const gateway = new MercadoPagoOrdersClient('audit-test-token-' + 'x'.repeat(32), async (url, init) => {
        const refund = url.endsWith('/refund');
        if (refund) {
          refundCalls += 1;
          refunded = true;
        } else if (init?.method === 'POST') {
          const body = JSON.parse(init!.body as string) as {total_amount: string};
          requestedAmount = body.total_amount;
        }
        return new Response(JSON.stringify({
          id: orderId, status: refunded ? 'refunded' : 'created',
          total_amount: requestedAmount,
          status_detail: refunded ? 'refunded' : 'waiting_payment',
          transactions: {payments: [{
            id: 'PAY01COUPONAUDIT123456789', status: refunded ? 'refunded' : 'pending',
            status_detail: refunded ? 'refunded' : 'pending_waiting_transfer',
            payment_method: {id: method === 'pix' ? 'pix' : 'visa',
              type: method === 'pix' ? 'bank_transfer' : 'credit_card',
              qr_code: 'audit-pix-qr', qr_code_base64: 'YXVkaXQ='},
          }]},
        }), {status: refund ? 200 : 201, headers: {'content-type': 'application/json'}});
      });
      const input = {finance, gateway, ride, identity: null, payerEmail: 'audit@example.test',
        idempotencyKey: `audit-${method}-${ride.id}`, now};
      const intent = method === 'pix'
        ? await createMercadoPagoPixIntent({...input, pixPriceAdjustmentBps: 1000})
        : await createMercadoPagoCardIntent({...input, cardPriceAdjustmentBps: 1000,
          cardToken: 'audit-card-token', paymentMethodId: 'visa', paymentMethodType: 'credit_card', installments: 1});
      assert.equal(requestedAmount, (scenario.payable / 100).toFixed(2));
      assert.equal(intent.payment.amountCents, scenario.payable);
      const captured = await applyMercadoPagoOrderStatus({finance, now, order: {
        orderId, externalReference: intent.payment.id, status: 'processed', statusDetail: 'accredited',
        totalAmountCents: scenario.payable, paymentId: 'PAY01COUPONAUDIT123456789',
        paymentStatus: 'processed', paymentStatusDetail: 'accredited',
      }});
      assert.equal(captured.kind, 'paid');
      await fundRidePromotion({promotions, finance, ride, now});
      const paid = await confirmRidePayment(rides, {rideId: ride.id, payment: captured.payment, confirmedAt: now});
      const searching = {...paid, state: transitionRide(paid.state, 'SEARCHING_DRIVER')};
      await rides.save({...searching, state: transitionRide(searching.state, 'NO_DRIVER_FOUND')});
      const refund = () => automaticallyRefundRide({rides, promotions, finance, gateway,
        rideId: ride.id, passengerId: ride.passengerId, now});
      assert.equal((await refund()).refundStatus, 'refunded');
      assert.equal((await refund()).duplicateRefund, true);
      assert.equal(refundCalls, 1);
      assert.equal(await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`), 0);
      assert.equal(await finance.getAccountBalanceCents('platform:promotion_expense'), 0);
      assert.equal((await promotions.findRedemptionById(ride.promotion!.applicationId))?.status, 'released');
    });
  }
}

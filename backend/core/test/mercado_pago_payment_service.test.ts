import assert from 'node:assert/strict';
import test from 'node:test';

import type { AuthIdentityRecord } from '../src/auth/auth-otp-repository.js';
import {
  applyMercadoPagoOrderStatus,
  createMercadoPagoPixIntent,
  shouldRefundMercadoPagoPaymentBeforeDispatch,
} from '../src/payments/mercado-pago-payment-service.js';
import { MercadoPagoOrdersClient } from '../src/payments/mercado-pago-orders.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { confirmRidePayment } from '../src/rides/confirm-payment.js';
import { refundMercadoPagoRideAfterNoDriver } from '../src/rides/refund-external-no-driver.js';
import { InMemoryRideRepository } from '../src/rides/repositories/in-memory-ride-repository.js';
import { transitionRide } from '../src/rides/ride-state.js';
import type { RideRecord } from '../src/rides/ride.js';

const now = new Date('2026-09-24T08:00:00.000Z');

function preparedRide(): RideRecord {
  return {
    id: '21212121-2121-4121-8121-212121212121',
    passengerId: 'passenger-mp-001',
    state: 'AWAITING_PAYMENT',
    paymentStatus: 'created',
    reservedDriverId: 'driver-mp-reserved',
    driverHoldExpiresAt: '2026-09-24T08:10:00.000Z',
    pickupLatitude: -2.82017,
    pickupLongitude: -40.41467,
    dropoffLatitude: -2.89860,
    dropoffLongitude: -40.45060,
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'mp-test-rule',
      baseAmountCents: 12000,
      pickupCompensationCents: 0,
      totalAmountCents: 12000,
      platformCommissionCents: 1200,
      driverNetCents: 10800,
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function identity(): AuthIdentityRecord {
  return {
    id: '31313131-3131-4131-8131-313131313131',
    subjectId: 'passenger-mp-001',
    subjectType: 'passenger',
    phoneE164: '+5588999991234',
    emailNormalized: 'passageiro@example.com',
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function gateway(
  requests: string[],
  options: { refundCompletes?: boolean } = {},
) {
  let externalReference = '';
  let refunded = false;

  return new MercadoPagoOrdersClient(
    'test-token-' + 'x'.repeat(32),
    async (url, init) => {
      requests.push(`${init?.method ?? 'GET'} ${url}`);

      if (url.endsWith('/refund')) {
        refunded = options.refundCompletes !== false;
        return new Response(
          JSON.stringify({
            id: 'ORD01PIXTEST123456789',
            status: refunded ? 'refunded' : 'processed',
            status_detail: refunded ? 'refunded' : 'accredited',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(
          JSON.stringify({
            id: 'ORD01PIXTEST123456789',
            external_reference: externalReference,
            status: refunded ? 'refunded' : 'processed',
            status_detail: refunded ? 'refunded' : 'accredited',
            total_amount: '120.00',
            transactions: {
              payments: [
                {
                  id: 'PAY01PIXTEST123456789',
                  status: refunded ? 'refunded' : 'processed',
                  status_detail: refunded ? 'refunded' : 'accredited',
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      const body =
        typeof init?.body === 'string'
          ? JSON.parse(init.body) as { external_reference?: string }
          : {};
      externalReference = body.external_reference ?? '';

      return new Response(
        JSON.stringify({
          id: 'ORD01PIXTEST123456789',
          status: 'created',
          status_detail: 'waiting_payment',
          transactions: {
            payments: [
              {
                id: 'PAY01PIXTEST123456789',
                status: 'pending',
                status_detail: 'pending_waiting_transfer',
                payment_method: {
                  id: 'pix',
                  type: 'bank_transfer',
                  ticket_url: 'https://example.test/pix',
                  qr_code: '000201010212-test',
                  qr_code_base64: 'dGVzdA==',
                },
              },
            ],
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    },
  );
}

test('Pix Mercado Pago passa de created para pending e depois paid', async () => {
  const finance = new InMemoryFinanceRepository();
  const requests: string[] = [];
  const mp = gateway(requests);
  const ride = preparedRide();

  const intent = await createMercadoPagoPixIntent({
    finance,
    gateway: mp,
    ride,
    identity: identity(),
    idempotencyKey: 'pix-idempotency-test-001',
    now,
  });

  assert.equal(intent.payment.status, 'pending');
  assert.equal(
    intent.payment.processorPaymentId,
    'ORD01PIXTEST123456789',
  );
  assert.equal(intent.payment.processor, 'mercado-pago-orders');

  const applied = await applyMercadoPagoOrderStatus({
    finance,
    order: {
      orderId: 'ORD01PIXTEST123456789',
      externalReference: intent.payment.id,
      status: 'processed',
      statusDetail: 'accredited',
      totalAmountCents: 12000,
      paymentId: 'PAY01PIXTEST123456789',
      paymentStatus: 'processed',
      paymentStatusDetail: 'accredited',
    },
    now: new Date('2026-09-24T08:01:00.000Z'),
  });

  assert.equal(applied.kind, 'paid');
  assert.equal(applied.payment.status, 'paid');
  assert.equal(
    await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`),
    12000,
  );
  assert.equal(requests[0], 'POST https://api.mercadopago.com/v1/orders');
});

test('sem motorista estorna Order Mercado Pago e reverte escrow uma vez', async () => {
  const finance = new InMemoryFinanceRepository();
  const rides = new InMemoryRideRepository();
  const requests: string[] = [];
  const mp = gateway(requests);
  const ride = await rides.create(preparedRide());

  const intent = await createMercadoPagoPixIntent({
    finance,
    gateway: mp,
    ride,
    identity: identity(),
    idempotencyKey: 'pix-idempotency-refund-001',
    now,
  });

  const applied = await applyMercadoPagoOrderStatus({
    finance,
    order: {
      orderId: 'ORD01PIXTEST123456789',
      externalReference: intent.payment.id,
      status: 'processed',
      statusDetail: 'accredited',
      totalAmountCents: 12000,
      paymentId: 'PAY01PIXTEST123456789',
      paymentStatus: 'processed',
      paymentStatusDetail: 'accredited',
    },
    now: new Date('2026-09-24T08:01:00.000Z'),
  });
  assert.equal(applied.kind, 'paid');

  const paid = await confirmRidePayment(rides, {
    rideId: ride.id,
    payment: applied.payment,
    confirmedAt: new Date('2026-09-24T08:01:01.000Z'),
  });
  const searching = await rides.save({
    ...paid,
    state: transitionRide(paid.state, 'SEARCHING_DRIVER'),
    updatedAt: '2026-09-24T08:01:02.000Z',
  });
  const noDriver = await rides.save({
    ...searching,
    state: transitionRide(searching.state, 'NO_DRIVER_FOUND'),
    updatedAt: '2026-09-24T08:01:03.000Z',
  });

  const first = await refundMercadoPagoRideAfterNoDriver({
    rides,
    finance,
    gateway: mp,
    rideId: noDriver.id,
    paymentId: applied.payment.id,
    passengerId: noDriver.passengerId,
    now: new Date('2026-09-24T08:02:00.000Z'),
  });

  assert.equal(first.ride.state, 'REFUNDED');
  assert.equal(first.payment.status, 'refunded');
  assert.equal(first.duplicateRefund, false);
  assert.equal(
    await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`),
    0,
  );

  const second = await refundMercadoPagoRideAfterNoDriver({
    rides,
    finance,
    gateway: mp,
    rideId: noDriver.id,
    paymentId: applied.payment.id,
    passengerId: noDriver.passengerId,
    now: new Date('2026-09-24T08:03:00.000Z'),
  });

  assert.equal(second.duplicateRefund, true);
  assert.equal(
    requests.filter((request) => request.endsWith('/refund')).length,
    1,
  );
});


test('status_detail refunded tem prioridade sobre status processed', async () => {
  const finance = new InMemoryFinanceRepository();
  const requests: string[] = [];
  const mp = gateway(requests);
  const ride = preparedRide();

  const intent = await createMercadoPagoPixIntent({
    finance,
    gateway: mp,
    ride,
    identity: identity(),
    idempotencyKey: 'pix-idempotency-refund-status-detail',
    now,
  });

  const paid = await applyMercadoPagoOrderStatus({
    finance,
    order: {
      orderId: 'ORD01PIXTEST123456789',
      externalReference: intent.payment.id,
      status: 'processed',
      statusDetail: 'accredited',
      totalAmountCents: 12000,
      paymentId: 'PAY01PIXTEST123456789',
      paymentStatus: 'processed',
      paymentStatusDetail: 'accredited',
    },
    now: new Date('2026-09-24T08:01:00.000Z'),
  });
  assert.equal(paid.kind, 'paid');

  const refunded = await applyMercadoPagoOrderStatus({
    finance,
    order: {
      orderId: 'ORD01PIXTEST123456789',
      externalReference: intent.payment.id,
      status: 'processed',
      statusDetail: 'refunded',
      totalAmountCents: 12000,
      paymentId: 'PAY01PIXTEST123456789',
      paymentStatus: 'processed',
      paymentStatusDetail: 'refunded',
    },
    now: new Date('2026-09-24T08:02:00.000Z'),
  });

  assert.equal(refunded.kind, 'refunded');
  assert.equal(refunded.payment.status, 'refunded');
  assert.equal(
    await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`),
    0,
  );
});

test('reembolso parcial não é confundido com pagamento aprovado', async () => {
  const finance = new InMemoryFinanceRepository();
  const requests: string[] = [];
  const mp = gateway(requests);
  const ride = preparedRide();

  const intent = await createMercadoPagoPixIntent({
    finance,
    gateway: mp,
    ride,
    identity: identity(),
    idempotencyKey: 'pix-idempotency-partial-refund',
    now,
  });

  const paid = await applyMercadoPagoOrderStatus({
    finance,
    order: {
      orderId: 'ORD01PIXTEST123456789',
      externalReference: intent.payment.id,
      status: 'processed',
      statusDetail: 'accredited',
      totalAmountCents: 12000,
      paymentId: 'PAY01PIXTEST123456789',
      paymentStatus: 'processed',
      paymentStatusDetail: 'accredited',
    },
    now: new Date('2026-09-24T08:01:00.000Z'),
  });
  assert.equal(paid.kind, 'paid');

  const partial = await applyMercadoPagoOrderStatus({
    finance,
    order: {
      orderId: 'ORD01PIXTEST123456789',
      externalReference: intent.payment.id,
      status: 'processed',
      statusDetail: 'partially_refunded',
      totalAmountCents: 12000,
      paymentId: 'PAY01PIXTEST123456789',
      paymentStatus: 'processed',
      paymentStatusDetail: 'partially_refunded',
    },
    now: new Date('2026-09-24T08:02:00.000Z'),
  });

  assert.equal(partial.kind, 'partially_refunded');
  assert.equal(partial.payment.status, 'paid');
  assert.equal(
    await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`),
    12000,
  );
});


test('estorno externo pendente mantém corrida em REFUND_PENDING', async () => {
  const finance = new InMemoryFinanceRepository();
  const rides = new InMemoryRideRepository();
  const requests: string[] = [];
  const mp = gateway(requests, { refundCompletes: false });
  const ride = await rides.create(preparedRide());

  const intent = await createMercadoPagoPixIntent({
    finance,
    gateway: mp,
    ride,
    identity: identity(),
    idempotencyKey: 'pix-idempotency-refund-pending',
    now,
  });

  const applied = await applyMercadoPagoOrderStatus({
    finance,
    order: {
      orderId: 'ORD01PIXTEST123456789',
      externalReference: intent.payment.id,
      status: 'processed',
      statusDetail: 'accredited',
      totalAmountCents: 12000,
      paymentId: 'PAY01PIXTEST123456789',
      paymentStatus: 'processed',
      paymentStatusDetail: 'accredited',
    },
    now: new Date('2026-09-24T08:01:00.000Z'),
  });
  assert.equal(applied.kind, 'paid');

  const paid = await confirmRidePayment(rides, {
    rideId: ride.id,
    payment: applied.payment,
    confirmedAt: new Date('2026-09-24T08:01:01.000Z'),
  });
  const searching = await rides.save({
    ...paid,
    state: transitionRide(paid.state, 'SEARCHING_DRIVER'),
    updatedAt: '2026-09-24T08:01:02.000Z',
  });
  const noDriver = await rides.save({
    ...searching,
    state: transitionRide(searching.state, 'NO_DRIVER_FOUND'),
    updatedAt: '2026-09-24T08:01:03.000Z',
  });

  const result = await refundMercadoPagoRideAfterNoDriver({
    rides,
    finance,
    gateway: mp,
    rideId: noDriver.id,
    paymentId: applied.payment.id,
    passengerId: noDriver.passengerId,
    now: new Date('2026-09-24T08:02:00.000Z'),
  });

  assert.equal(result.ride.state, 'REFUND_PENDING');
  assert.equal(result.payment.status, 'paid');
  assert.equal(
    await finance.getAccountBalanceCents(`ride:${ride.id}:escrow`),
    12000,
  );
  assert.equal(
    requests.filter((request) => request.endsWith('/refund')).length,
    1,
  );
});


test('Pix confirmado após expirar hold exige estorno antes do dispatch', () => {
  const ride = preparedRide();

  assert.equal(
    shouldRefundMercadoPagoPaymentBeforeDispatch(
      ride,
      new Date('2026-09-24T08:05:00.000Z'),
    ),
    false,
  );

  assert.equal(
    shouldRefundMercadoPagoPaymentBeforeDispatch(
      ride,
      new Date('2026-09-24T08:10:00.000Z'),
    ),
    true,
  );

  assert.equal(
    shouldRefundMercadoPagoPaymentBeforeDispatch(
      {
        ...ride,
        state: 'PAID',
      },
      new Date('2026-09-24T08:11:00.000Z'),
    ),
    false,
  );
});

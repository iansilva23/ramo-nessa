import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HttpDriverPayoutProvider,
  type DriverPayoutProvider,
} from '../src/payments/driver-payout-provider.js';
import {
  processDriverPayout,
  reconcileDriverPayouts,
} from '../src/payments/driver-payout-processing-service.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';
import { requestDriverPayout } from '../src/payments/request-payout.js';
import { settleCompletedRide } from '../src/payments/settlement.js';
import type { PaymentRecord } from '../src/payments/payment.js';
import type { RideRecord } from '../src/rides/ride.js';

function ride(): RideRecord {
  return {
    id: '10101010-1010-4010-8010-101010101010',
    passengerId: 'passenger-payout-provider',
    driverId: 'driver-payout-provider',
    state: 'COMPLETED',
    paymentStatus: 'paid',
    origin: { zoneId: 'prea' },
    destination: { zoneId: 'jijoca' },
    category: 'car',
    period: 'day',
    passengers: 1,
    quote: {
      ruleId: 'provider-payout-test',
      baseAmountCents: 10000,
      pickupCompensationCents: 0,
      totalAmountCents: 10000,
      platformCommissionCents: 1000,
      driverNetCents: 9000,
    },
    createdAt: '2026-09-28T10:00:00.000Z',
    updatedAt: '2026-09-28T10:20:00.000Z',
  };
}

async function financeWithBalance() {
  const finance = new InMemoryFinanceRepository();
  const payment: PaymentRecord = {
    id: '20202020-2020-4020-8020-202020202020',
    rideId: ride().id,
    method: 'pix',
    processor: 'test-gateway',
    status: 'pending',
    amountCents: 10000,
    idempotencyKey: 'provider-payout-payment',
    createdAt: '2026-09-28T10:01:00.000Z',
    updatedAt: '2026-09-28T10:01:00.000Z',
  };
  await finance.createPayment(payment);
  const captured = await finance.capturePayment({
    paymentId: payment.id,
    processorEventId: 'provider-payout-capture',
  });
  await settleCompletedRide(finance, {
    ride: ride(),
    payment: captured.payment,
  });
  await finance.upsertDriverPayoutDestination({
    driverId: 'driver-payout-provider',
    pixKeyType: 'random',
    pixKey: '30303030-3030-4030-8030-303030303030',
    createdAt: '2026-09-28T10:30:00.000Z',
    updatedAt: '2026-09-28T10:30:00.000Z',
  });
  return finance;
}

test('provedor HTTP envia Pix sem expor token no payload', async () => {
  let capturedUrl = '';
  let capturedAuthorization = '';
  let capturedIdempotency = '';
  let capturedBody = '';

  const provider = new HttpDriverPayoutProvider(
    'test-provider',
    new URL('https://payout.example.test/'),
    'provider-token-' + 'x'.repeat(30),
    async (url, init) => {
      capturedUrl = url;
      capturedAuthorization = String(
        (init?.headers as Record<string, string>)?.authorization ?? '',
      );
      capturedIdempotency = String(
        (init?.headers as Record<string, string>)?.['idempotency-key'] ?? '',
      );
      capturedBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          id: 'provider-payout-001',
          status: 'processing',
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    },
  );

  const result = await provider.createPixPayout({
    payoutId: 'payout-internal-001',
    amountCents: 5000,
    pixKeyType: 'random',
    pixKey: '40404040-4040-4040-8040-404040404040',
  });

  assert.equal(
    capturedUrl,
    'https://payout.example.test/v1/pix/payouts',
  );
  assert.equal(
    capturedAuthorization,
    'Bearer provider-token-' + 'x'.repeat(30),
  );
  assert.equal(capturedIdempotency, 'payout-internal-001');
  assert.equal(capturedBody.includes('provider-token'), false);
  assert.equal(result.status, 'processing');
});

test('saque vai de reservado para processing e depois paid uma única vez', async () => {
  const finance = await financeWithBalance();
  const requested = await requestDriverPayout(finance, {
    driverId: 'driver-payout-provider',
    amountCents: 5000,
    idempotencyKey: 'provider-payout-request-001',
  });

  let statusReads = 0;
  const provider: DriverPayoutProvider = {
    name: 'test-provider',
    async createPixPayout() {
      return {
        providerPayoutId: 'provider-payout-002',
        status: 'processing',
      };
    },
    async getPayoutStatus() {
      statusReads += 1;
      return {
        providerPayoutId: 'provider-payout-002',
        status: 'paid',
      };
    },
  };

  const started = await processDriverPayout({
    finance,
    provider,
    payoutId: requested.payout.id,
  });
  assert.equal(started.kind, 'processing');
  assert.equal(started.payout.status, 'processing');

  const paid = await processDriverPayout({
    finance,
    provider,
    payoutId: requested.payout.id,
  });
  assert.equal(paid.kind, 'paid');
  assert.equal(paid.payout.status, 'paid');
  assert.equal(statusReads, 1);
  assert.equal(
    await finance.getAccountBalanceCents(
      'driver:driver-payout-provider:payout_pending',
    ),
    0,
  );
  assert.equal(
    await finance.getAccountBalanceCents(
      'driver:driver-payout-provider:payable',
    ),
    4000,
  );

  const terminal = await processDriverPayout({
    finance,
    provider,
    payoutId: requested.payout.id,
  });
  assert.equal(terminal.kind, 'terminal');
});

test('falha do provedor devolve reserva ao saldo do motorista', async () => {
  const finance = await financeWithBalance();
  const requested = await requestDriverPayout(finance, {
    driverId: 'driver-payout-provider',
    amountCents: 5000,
    idempotencyKey: 'provider-payout-request-failed',
  });

  const provider: DriverPayoutProvider = {
    name: 'test-provider',
    async createPixPayout() {
      return {
        providerPayoutId: 'provider-payout-failed',
        status: 'failed',
      };
    },
    async getPayoutStatus() {
      throw new Error('não deveria consultar status');
    },
  };

  const failed = await processDriverPayout({
    finance,
    provider,
    payoutId: requested.payout.id,
  });

  assert.equal(failed.kind, 'failed');
  assert.equal(failed.payout.status, 'failed');
  assert.equal(
    await finance.getAccountBalanceCents(
      'driver:driver-payout-provider:payout_pending',
    ),
    0,
  );
  assert.equal(
    await finance.getAccountBalanceCents(
      'driver:driver-payout-provider:payable',
    ),
    9000,
  );
});

test('reconciliação em lote reprocessa requested/processing sem duplicar ledger', async () => {
  const finance = await financeWithBalance();
  await requestDriverPayout(finance, {
    driverId: 'driver-payout-provider',
    amountCents: 5000,
    idempotencyKey: 'provider-payout-batch',
  });

  const provider: DriverPayoutProvider = {
    name: 'test-provider',
    async createPixPayout() {
      return {
        providerPayoutId: 'provider-payout-batch-id',
        status: 'paid',
      };
    },
    async getPayoutStatus(providerPayoutId) {
      return {
        providerPayoutId,
        status: 'paid',
      };
    },
  };

  const first = await reconcileDriverPayouts({
    finance,
    provider,
  });
  assert.equal(first.paid, 1);
  assert.equal(first.errors, 0);

  const second = await reconcileDriverPayouts({
    finance,
    provider,
  });
  assert.equal(second.processed, 0);
  assert.equal(
    await finance.getAccountBalanceCents(
      'driver:driver-payout-provider:payout_pending',
    ),
    0,
  );
});

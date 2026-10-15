import assert from 'node:assert/strict';
import test from 'node:test';

import type { AuthIdentityRecord } from '../src/auth/auth-otp-repository.js';
import { MercadoPagoOrdersClient } from '../src/payments/mercado-pago-orders.js';
import {
  applyMercadoPagoWalletTopupOrderStatus,
  createMercadoPagoWalletPixTopup,
} from '../src/payments/mercado-pago-wallet-topup-service.js';
import { InMemoryFinanceRepository } from '../src/payments/repositories/in-memory-finance-repository.js';

const now = new Date('2026-09-28T12:00:00.000Z');

function identity(): AuthIdentityRecord {
  return {
    id: '31313131-3131-4131-8131-313131313131',
    subjectId: 'passenger-wallet-mp',
    subjectType: 'passenger',
    phoneE164: '+5588999991234',
    emailNormalized: 'passageiro@example.com',
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function gateway(requests: string[]) {
  let externalReference = '';

  return new MercadoPagoOrdersClient(
    'test-token-' + 'x'.repeat(32),
    async (url, init) => {
      requests.push(`${init?.method ?? 'GET'} ${url}`);

      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(
          JSON.stringify({
            id: 'ORD01WALLETTOPUP123456',
            external_reference: externalReference,
            status: 'processed',
            status_detail: 'accredited',
            total_amount: '50.00',
            transactions: {
              payments: [
                {
                  id: 'PAY01WALLETTOPUP123456',
                  status: 'processed',
                  status_detail: 'accredited',
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
          id: 'ORD01WALLETTOPUP123456',
          status: 'created',
          status_detail: 'waiting_payment',
          transactions: {
            payments: [
              {
                id: 'PAY01WALLETTOPUP123456',
                status: 'pending',
                status_detail: 'pending_waiting_transfer',
                payment_method: {
                  id: 'pix',
                  type: 'bank_transfer',
                  ticket_url: 'https://example.test/wallet-pix',
                  qr_code: '000201010212-wallet-topup',
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

test('recarga Pix Mercado Pago só credita carteira após confirmação', async () => {
  const finance = new InMemoryFinanceRepository();
  const requests: string[] = [];
  const mp = gateway(requests);

  const intent = await createMercadoPagoWalletPixTopup({
    finance,
    gateway: mp,
    passengerId: 'passenger-wallet-mp',
    identity: identity(),
    amountCents: 5000,
    idempotencyKey: 'wallet-mp-topup-001',
    now,
  });

  assert.equal(intent.topup.status, 'pending');
  assert.equal(intent.topup.processorTopupId, 'ORD01WALLETTOPUP123456');
  assert.equal(
    await finance.getAccountBalanceCents(
      'passenger:passenger-wallet-mp:wallet',
    ),
    0,
  );

  const applied = await applyMercadoPagoWalletTopupOrderStatus({
    finance,
    order: {
      orderId: 'ORD01WALLETTOPUP123456',
      externalReference: intent.topup.id,
      status: 'processed',
      statusDetail: 'accredited',
      totalAmountCents: 5000,
      paymentId: 'PAY01WALLETTOPUP123456',
      paymentStatus: 'processed',
      paymentStatusDetail: 'accredited',
    },
    now: new Date('2026-09-28T12:01:00.000Z'),
  });

  assert.equal(applied.kind, 'paid');
  assert.equal(applied.topup.status, 'paid');
  assert.equal(
    await finance.getAccountBalanceCents(
      'passenger:passenger-wallet-mp:wallet',
    ),
    5000,
  );

  const duplicate = await applyMercadoPagoWalletTopupOrderStatus({
    finance,
    order: {
      orderId: 'ORD01WALLETTOPUP123456',
      externalReference: intent.topup.id,
      status: 'processed',
      statusDetail: 'accredited',
      totalAmountCents: 5000,
      paymentId: 'PAY01WALLETTOPUP123456',
      paymentStatus: 'processed',
      paymentStatusDetail: 'accredited',
    },
  });

  assert.equal(duplicate.kind, 'paid');
  assert.equal(
    await finance.getAccountBalanceCents(
      'passenger:passenger-wallet-mp:wallet',
    ),
    5000,
  );
  assert.equal(requests[0], 'POST https://api.mercadopago.com/v1/orders');
});

test('recarga Pix rejeita Order com valor divergente', async () => {
  const finance = new InMemoryFinanceRepository();
  const mp = gateway([]);

  const intent = await createMercadoPagoWalletPixTopup({
    finance,
    gateway: mp,
    passengerId: 'passenger-wallet-mp',
    identity: identity(),
    amountCents: 5000,
    idempotencyKey: 'wallet-mp-topup-amount',
    now,
  });

  await assert.rejects(
    () =>
      applyMercadoPagoWalletTopupOrderStatus({
        finance,
        order: {
          orderId: 'ORD01WALLETTOPUP123456',
          externalReference: intent.topup.id,
          status: 'processed',
          statusDetail: 'accredited',
          totalAmountCents: 4999,
          paymentId: 'PAY01WALLETTOPUP123456',
          paymentStatus: 'processed',
          paymentStatusDetail: 'accredited',
        },
      }),
    /Valor da Order não confere com a recarga/,
  );
});

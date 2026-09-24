import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  MercadoPagoOrdersClient,
  verifyMercadoPagoWebhookSignature,
} from '../src/payments/mercado-pago-orders.js';

test('cria Order Pix com idempotência e dados do pagador', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const client = new MercadoPagoOrdersClient(
    'test-token-' + 'x'.repeat(32),
    async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify({
          id: 'ORD01TESTORDER123456789',
          status: 'created',
          status_detail: 'waiting_payment',
          transactions: {
            payments: [
              {
                id: 'PAY01TESTPAYMENT123456',
                status: 'pending',
                status_detail: 'pending_waiting_transfer',
                payment_method: {
                  id: 'pix',
                  type: 'bank_transfer',
                  ticket_url: 'https://example.test/pix',
                  qr_code: '000201010212-test-pix',
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

  const result = await client.createPixOrder({
    paymentId: 'payment-internal-001',
    amountCents: 12345,
    payerEmail: 'passageiro@example.com',
    idempotencyKey: 'mp-pix-payment-internal-001',
  });

  assert.equal(capturedUrl, 'https://api.mercadopago.com/v1/orders');
  assert.equal(
    new Headers(capturedInit?.headers).get('x-idempotency-key'),
    'mp-pix-payment-internal-001',
  );

  const body = JSON.parse(String(capturedInit?.body)) as {
    total_amount: string;
    external_reference: string;
    payer: { email: string };
    transactions: { payments: Array<{ amount: string }> };
  };
  assert.equal(body.total_amount, '123.45');
  assert.equal(body.external_reference, 'payment-internal-001');
  assert.equal(body.payer.email, 'passageiro@example.com');
  assert.equal(body.transactions.payments[0]?.amount, '123.45');
  assert.equal(result.orderId, 'ORD01TESTORDER123456789');
  assert.equal(result.qrCode, '000201010212-test-pix');
});

test('consulta Order e lê status consolidado e da transação', async () => {
  const client = new MercadoPagoOrdersClient(
    'test-token-' + 'x'.repeat(32),
    async () =>
      new Response(
        JSON.stringify({
          id: 'ORD01TESTORDER123456789',
          external_reference: 'payment-internal-001',
          status: 'processed',
          status_detail: 'accredited',
          total_amount: '123.45',
          transactions: {
            payments: [
              {
                id: 'PAY01TESTPAYMENT123456',
                status: 'processed',
                status_detail: 'accredited',
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );

  const order = await client.getOrder('ORD01TESTORDER123456789');
  assert.equal(order.externalReference, 'payment-internal-001');
  assert.equal(order.totalAmountCents, 12345);
  assert.equal(order.status, 'processed');
  assert.equal(order.paymentStatus, 'processed');
});

test('valida assinatura HMAC com data.id em minúsculas no manifesto', () => {
  const dataId = 'ORD01MiXeDCase123';
  const requestId = 'request-123';
  const timestamp = '1760000000000';
  const secret = 'webhook-secret-test-only-123456789';
  const manifest =
    `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac('sha256', secret)
    .update(manifest, 'utf8')
    .digest('hex');

  assert.equal(
    verifyMercadoPagoWebhookSignature({
      xSignature: `ts=${timestamp},v1=${signature}`,
      xRequestId: requestId,
      dataId,
      secret,
    }),
    true,
  );

  assert.equal(
    verifyMercadoPagoWebhookSignature({
      xSignature: `ts=${timestamp},v1=${signature}`,
      xRequestId: requestId,
      dataId,
      secret,
    }),
    true,
  );

  assert.equal(
    verifyMercadoPagoWebhookSignature({
      xSignature: `ts=${timestamp},v1=${signature}`,
      xRequestId: requestId,
      dataId: `${dataId}X`,
      secret,
    }),
    false,
  );
});

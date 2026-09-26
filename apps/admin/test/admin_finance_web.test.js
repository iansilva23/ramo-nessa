import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createAdminApi } from '../src/api.js';

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type'
          ? 'application/json; charset=utf-8'
          : null;
      },
    },
    async json() {
      return payload;
    },
  };
}

test('cliente Admin consulta financeiro sem vazar Bearer na URL', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      readOnly: true,
      summary: {
        paymentsTotal: 1,
        paymentsPaid: 1,
        paymentsPaidCents: 10000,
        paymentsPending: 0,
        paymentsFailed: 0,
        paymentsCancelled: 0,
        paymentsRefunded: 0,
        platformRevenueCents: 1000,
        driverPayableCents: 9000,
        driverPayoutPendingCents: 0,
        rideEscrowCents: 0,
        passengerWalletCents: 0,
        payoutsRequested: 0,
        payoutsRequestedCents: 0,
      },
      payments: [],
      payouts: [],
    });
  });

  const token = 'rn_admin_session_finance_secret';
  const payload = await api.finance(token, 25);

  assert.equal(payload.readOnly, true);
  assert.equal(payload.summary.platformRevenueCents, 1000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/v1/admin/finance?limit=25');
  assert.equal(calls[0].url.includes(token), false);
  assert.equal(
    calls[0].options.headers.authorization,
    `Bearer ${token}`,
  );
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('política cash usa Bearer e permite toggle explícito pelo Admin', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(
      url === '/v1/admin/payment-policy' && options.method === 'PATCH'
        ? 200
        : 200,
      {
        cashEnabled: false,
        pixPriceAdjustmentBps: 99,
        cardPriceAdjustmentBps: 498,
        cashActivationReady: true,
        futureCashDebtLimitCents: 12000,
        allowedDigitalMethods: ['pix', 'card', 'wallet'],
        updatedAt: '2026-09-24T01:00:00.000Z',
      },
    );
  });

  const token = 'rn_admin_session_cash_policy_secret';
  const policy = await api.paymentPolicy(token);
  assert.equal(policy.cashEnabled, false);
  assert.equal(policy.pixPriceAdjustmentBps, 99);
  assert.equal(policy.cardPriceAdjustmentBps, 498);

  await api.updatePaymentPolicy(token, { cashEnabled: true });
  await api.updatePaymentPolicy(token, {
    pixPriceAdjustmentBps: 125,
    cardPriceAdjustmentBps: 525,
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, '/v1/admin/payment-policy');
  assert.equal(calls[1].url, '/v1/admin/payment-policy');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(
    calls[1].options.body,
    JSON.stringify({
      cashEnabled: true,
    }),
  );
  assert.equal(calls[2].options.method, 'PATCH');
  assert.equal(
    calls[2].options.body,
    JSON.stringify({
      pixPriceAdjustmentBps: 125,
      cardPriceAdjustmentBps: 525,
    }),
  );
  for (const call of calls) {
    assert.equal(call.url.includes(token), false);
    assert.equal(
      call.options.headers.authorization,
      `Bearer ${token}`,
    );
  }
});

test('frontend financeiro é somente leitura e usa o ledger do Core', () => {
  const html = [
    readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    ),
    readFileSync(
      new URL('../pages/finance.html', import.meta.url),
      'utf8',
    ),
  ].join('\n');
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );
  const api = readFileSync(
    new URL('../src/api.js', import.meta.url),
    'utf8',
  );
  const css = readFileSync(
    new URL('../styles.css', import.meta.url),
    'utf8',
  );

  for (const id of [
    'view-finance',
    'refresh-finance-button',
    'finance-updated-at',
    'finance-paid-total',
    'finance-paid-count',
    'finance-platform-revenue',
    'finance-driver-payable',
    'finance-payout-pending',
    'finance-payout-count',
    'finance-ride-escrow',
    'finance-passenger-wallet',
    'finance-payments-total',
    'finance-payments-pending',
    'finance-payments-failed',
    'finance-payments-cancelled',
    'finance-payments-refunded',
    'finance-payments-body',
    'finance-payouts-body',
    'finance-cash-status',
    'finance-cash-debt-limit',
    'finance-cash-readiness',
    'finance-cash-updated-at',
    'finance-enable-cash-button',
    'finance-disable-cash-button',
    'finance-cash-note',
    'finance-pix-price-status',
    'finance-pix-price-form',
    'finance-pix-price-percent',
    'finance-pix-price-example',
    'finance-pix-price-save',
    'finance-pix-price-note',
    'finance-card-price-status',
    'finance-card-price-form',
    'finance-card-price-percent',
    'finance-card-price-example',
    'finance-card-price-save',
    'finance-card-price-note',
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }

  assert.match(html, /data-view=["']finance["']/);
  assert.match(html, /Somente leitura/i);
  assert.match(app, /hasScope\('finance:read'\)/);
  assert.match(app, /api\.finance\(state\.token, 25\)/);
  assert.match(app, /api\.paymentPolicy\(state\.token\)/);
  assert.match(app, /hasScope\('finance:write'\)/);
  assert.match(api, /\/v1\/admin\/finance\?limit=/);
  assert.match(api, /\/v1\/admin\/payment-policy/);
  assert.equal(html.includes('finance-enable-cash-button'), true);
  assert.equal(html.includes('Ativar dinheiro'), true);
  assert.match(app, /handleEnableCash/);
  assert.match(app, /cashEnabled: true/);
  assert.match(app, /handlePixPricePolicySubmit/);
  assert.match(app, /pixPriceAdjustmentBps/);
  assert.match(app, /handleCardPricePolicySubmit/);
  assert.match(app, /cardPriceAdjustmentBps/);
  assert.equal(api.includes('financeUpdate('), false);
  assert.equal(api.includes('refundPayment('), false);
  assert.equal(api.includes('approvePayout('), false);
  assert.equal(app.includes('.innerHTML'), false);

  for (const selector of [
    '.finance-readonly-note',
    '.finance-summary-grid',
    '.finance-status-strip',
    '.finance-columns',
    '.finance-table',
    '.finance-cash-card',
    '.finance-cash-grid',
    '.finance-cash-action',
  ]) {
    assert.equal(css.includes(selector), true);
  }
});

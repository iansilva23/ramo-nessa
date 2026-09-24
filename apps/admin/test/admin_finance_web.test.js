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

test('política cash usa Bearer e nunca oferece ativação no browser', async () => {
  const calls = [];
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(
      url === '/v1/admin/payment-policy' && options.method === 'PATCH'
        ? 200
        : 200,
      {
        cashEnabled: false,
        cashActivationReady: false,
        futureCashDebtLimitCents: 12000,
        allowedDigitalMethods: ['pix', 'card', 'wallet'],
        updatedAt: '2026-09-24T01:00:00.000Z',
      },
    );
  });

  const token = 'rn_admin_session_cash_policy_secret';
  const policy = await api.paymentPolicy(token);
  assert.equal(policy.cashEnabled, false);

  await api.updatePaymentPolicy(token, { cashEnabled: false });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/v1/admin/payment-policy');
  assert.equal(calls[1].url, '/v1/admin/payment-policy');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.equal(calls[1].options.body, JSON.stringify({ cashEnabled: false }));
  for (const call of calls) {
    assert.equal(call.url.includes(token), false);
    assert.equal(
      call.options.headers.authorization,
      `Bearer ${token}`,
    );
  }
});

test('frontend financeiro é somente leitura e usa o ledger do Core', () => {
  const html = readFileSync(
    new URL('../index.html', import.meta.url),
    'utf8',
  );
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
    'finance-disable-cash-button',
    'finance-cash-note',
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
  assert.equal(html.includes('finance-enable-cash-button'), false);
  assert.equal(html.includes('Ativar dinheiro'), false);
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

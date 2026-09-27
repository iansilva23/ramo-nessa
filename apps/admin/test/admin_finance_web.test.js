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
        pixEnabled: true,
        cardEnabled: true,
        walletEnabled: true,
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
  await api.updatePaymentPolicy(token, {
    pixEnabled: false,
    cardEnabled: true,
    walletEnabled: false,
    defaultCashDebtLimitCents: 18000,
  });

  assert.equal(calls.length, 4);
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
  assert.equal(calls[3].options.method, 'PATCH');
  assert.equal(
    calls[3].options.body,
    JSON.stringify({
      pixEnabled: false,
      cardEnabled: true,
      walletEnabled: false,
      defaultCashDebtLimitCents: 18000,
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

test('frontend financeiro mantém ledger protegido e gerencia conciliação de saques', () => {
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
    'finance-payout-detail',
    'finance-payout-close',
    'finance-payout-detail-status',
    'finance-payout-detail-driver',
    'finance-payout-detail-amount',
    'finance-payout-detail-pix',
    'finance-payout-detail-processor',
    'finance-payout-detail-reference',
    'finance-payout-paid-form',
    'finance-payout-processor',
    'finance-payout-reference',
    'finance-payout-paid-button',
    'finance-payout-cancel-button',
    'finance-payout-action-note',
    'finance-cash-status',
    'finance-cash-debt-limit',
    'finance-cash-readiness',
    'finance-cash-updated-at',
    'finance-enable-cash-button',
    'finance-disable-cash-button',
    'finance-cash-note',
    'finance-methods-status',
    'finance-methods-form',
    'finance-pix-enabled',
    'finance-card-enabled',
    'finance-wallet-enabled',
    'finance-methods-save',
    'finance-cash-limit-status',
    'finance-cash-limit-form',
    'finance-cash-limit-input',
    'finance-cash-limit-save',
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
  assert.match(html, /Conciliação segura/i);
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
  assert.match(app, /handlePaymentMethodsSubmit/);
  assert.match(app, /pixEnabled/);
  assert.match(app, /walletEnabled/);
  assert.match(app, /handleDefaultCashLimitSubmit/);
  assert.match(app, /defaultCashDebtLimitCents/);
  assert.match(app, /handlePixPricePolicySubmit/);
  assert.match(app, /pixPriceAdjustmentBps/);
  assert.match(app, /handleCardPricePolicySubmit/);
  assert.match(app, /cardPriceAdjustmentBps/);

  // Nunca renderizar ou liberar valores comerciais de fallback
  // antes da política real do Core chegar.
  assert.equal(html.includes('R$ 120,00'), false);
  assert.equal(html.includes('value="0.99"'), false);
  assert.equal(html.includes('value="4.98"'), false);
  assert.match(
    html,
    /id=["']finance-pix-enabled["'][^>]*disabled/,
  );
  assert.match(
    html,
    /id=["']finance-card-enabled["'][^>]*disabled/,
  );
  assert.match(
    html,
    /id=["']finance-wallet-enabled["'][^>]*disabled/,
  );
  assert.match(
    html,
    /id=["']finance-pix-price-percent["'][^>]*disabled/,
  );
  assert.match(
    html,
    /id=["']finance-card-price-percent["'][^>]*disabled/,
  );
  assert.match(
    app,
    /if \(!loaded\) \{[\s\S]*finance-methods-save[\s\S]*disabled = true/,
  );
  assert.match(app, /Aguardando a política real do Core/);
  assert.equal(
    app.includes(
      'policy?.futureCashDebtLimitCents ?? 12000',
    ),
    false,
  );

  assert.equal(api.includes('financeUpdate('), false);
  assert.equal(api.includes('refundPayment('), false);
  assert.match(api, /financePayout\(/);
  assert.match(api, /completeFinancePayout\(/);
  assert.match(api, /cancelFinancePayout\(/);
  assert.match(app, /openFinancePayout/);
  assert.match(app, /handleFinancePayoutPaid/);
  assert.match(app, /handleFinancePayoutCancel/);
  assert.match(app, /finance:write/);
  assert.match(html, /Registrar como pago/);
  assert.match(html, /Cancelar solicitação/);
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
    '.finance-payout-detail-card',
    '.finance-payout-detail-grid',
    '.finance-payout-form',
    '.finance-payout-actions',
  ]) {
    assert.equal(css.includes(selector), true);
  }
});


test('cliente Admin consulta, conclui e cancela saque com Bearer fora da URL', async () => {
  const calls = [];
  const payoutId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const api = createAdminApi(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(200, {
      payout: {
        id: payoutId,
        status: options.method === 'PATCH' ? 'paid' : 'requested',
      },
      duplicate: false,
      id: payoutId,
      status: 'requested',
    });
  });

  const token = 'rn_admin_payout_secret';
  await api.financePayout(token, payoutId);
  await api.completeFinancePayout(token, {
    payoutId,
    processor: 'Pix manual',
    processorPayoutId: 'comprovante-123',
  });
  await api.cancelFinancePayout(token, payoutId);

  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(
      call.url,
      `/v1/admin/finance/payouts/${payoutId}`,
    );
    assert.equal(call.url.includes(token), false);
    assert.equal(
      call.options.headers.authorization,
      `Bearer ${token}`,
    );
  }

  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    action: 'paid',
    processor: 'Pix manual',
    processorPayoutId: 'comprovante-123',
  });
  assert.equal(calls[2].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[2].options.body), {
    action: 'cancelled',
  });
});


test('ADM bloqueia mutações financeiras quando o snapshot fica desatualizado', () => {
  const app = readFileSync(
    new URL('../src/app.js', import.meta.url),
    'utf8',
  );

  assert.match(
    app,
    /function financeWritesAvailable\(\)[\s\S]*?state\.finance\.writeLocked !== true/,
  );
  assert.match(app, /writeLocked: true/);
  assert.match(
    app,
    /state\.finance\.writeLocked = false;[\s\S]*?renderFinance\(payload\)[\s\S]*?renderPaymentPolicy\(policy\)/,
  );
  assert.match(
    app,
    /state\.finance\.writeLocked = true;[\s\S]*?Falha ao atualizar · último dado[\s\S]*?renderPaymentPolicy\(state\.finance\.policy\)[\s\S]*?renderFinancePayoutDetail\(null\)/,
  );
  assert.match(
    app,
    /const canWrite =[\s\S]*?financeWritesAvailable\(\) && actionable/,
  );
  assert.ok(
    (app.match(/!financeWritesAvailable\(\)/g) ?? []).length >= 8,
    'todos os handlers financeiros sensíveis devem falhar fechado',
  );
});

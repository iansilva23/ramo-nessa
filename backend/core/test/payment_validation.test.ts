import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InvalidPaymentRequestError,
  parseCreatePaymentRequest,
} from '../src/payments/validation.js';

const baseCard = {
  method: 'card',
  payerEmail: 'passageiro@example.com',
  cardToken: 'secure-card-token-12345678901234567890',
  paymentMethodId: 'master',
  paymentMethodType: 'credit_card',
};

test('cartão sem installments explícito permanece à vista', () => {
  const parsed = parseCreatePaymentRequest(baseCard);

  assert.equal(parsed.installments, 1);
});

test('Core rejeita parcelamento acima de 1 parcela', () => {
  assert.throws(
    () =>
      parseCreatePaymentRequest({
        ...baseCard,
        installments: 2,
      }),
    (error: unknown) =>
      error instanceof InvalidPaymentRequestError &&
      error.message.includes('somente à vista'),
  );
});

test('Core aceita cartão com installments igual a 1', () => {
  const parsed = parseCreatePaymentRequest({
    ...baseCard,
    installments: 1,
  });

  assert.equal(parsed.installments, 1);
});

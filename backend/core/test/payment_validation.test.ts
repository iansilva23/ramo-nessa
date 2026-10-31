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


test('cartão recusa dados PCI e campos extras, sem incluir valores sensíveis no erro', () => {
  for (const key of ['cardNumber', 'pan', 'number', 'card_number', 'cvv',
    'securityCode', 'security_code', 'expirationMonth', 'expirationYear', 'cardholder', 'diagnostic']) {
    assert.throws(() => parseCreatePaymentRequest({ ...baseCard, [key]: 'sensitive-test-value' }),
      error => error instanceof InvalidPaymentRequestError &&
        !error.message.includes('sensitive-test-value'));
  }
  assert.equal(parseCreatePaymentRequest({ ...baseCard, savedCardId: 'saved-card-own-account' }).savedCardId, 'saved-card-own-account');
});

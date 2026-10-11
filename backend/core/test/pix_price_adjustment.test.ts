import assert from 'node:assert/strict';
import test from 'node:test';

import { pixPriceForBaseFare } from '../src/payments/pix-price-adjustment.js';

test('gross-up de 0,99% preserva R$ 150,00 de tarifa-base no Pix', () => {
  const result = pixPriceForBaseFare(15000, 99);
  assert.equal(result.baseFareAmountCents, 15000);
  assert.equal(result.totalAmountCents, 15150);
  assert.equal(result.priceAdjustmentCents, 150);
  assert.equal(result.pixPriceAdjustmentBps, 99);
});

test('ajuste Pix zero mantém o mesmo preço', () => {
  const result = pixPriceForBaseFare(15000, 0);
  assert.equal(result.totalAmountCents, 15000);
  assert.equal(result.priceAdjustmentCents, 0);
});

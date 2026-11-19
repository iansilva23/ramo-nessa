import test from 'node:test';
import assert from 'node:assert/strict';
import { readSearchCategory, defaultSearchPolicy } from '../src/driver-search-admin.js';

test('configuração separa categorias e começa sem ampliação nem novas tarifas', () => {
  const policy = defaultSearchPolicy(); policy.moto.allowExpansion = true;
  assert.equal(policy.buggy.allowExpansion, false);
  assert.equal(policy.car.useCustomPickupFees, false);
});
test('editor converte reais em centavos e exige cobertura completa de distância', () => {
  const input = { nearbyKm: 3, expandedKm: 15, allowExpansion: true, useCustomPickupFees: true,
    pickupFees: [{ upToKm: 3, amountReais: '0.00' }, { upToKm: 15, amountReais: '9.90' }] };
  assert.equal(readSearchCategory(input).pickupFees[1].amountCents, 990);
  assert.throws(() => readSearchCategory({ ...input, pickupFees: input.pickupFees.slice(0, 1) }));
  assert.throws(() => readSearchCategory({ ...input, expandedKm: 2 }));
  assert.throws(() => readSearchCategory({ ...input, pickupFees: [{ upToKm: 15, amountReais: '' }] }));
});

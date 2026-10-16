import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDriverSearchPolicy, validateDriverSearchPolicy, selectedDriverSearchRadius, customPickupFee } from '../src/matching/driver-search-policy.js';

test('ampliação exige escolha explícita e autorização da categoria', () => {
  const policy = defaultDriverSearchPolicy();
  assert.equal(selectedDriverSearchRadius(policy.buggy), 5);
  assert.throws(() => selectedDriverSearchRadius(policy.buggy, 15));
  policy.moto.allowExpansion = true;
  assert.equal(selectedDriverSearchRadius(policy.moto), 5);
  assert.equal(selectedDriverSearchRadius(policy.moto, 15), 15);
  assert.throws(() => selectedDriverSearchRadius(policy.buggy, 15));
  assert.throws(() => selectedDriverSearchRadius(policy.moto, 16));
});
test('faixas cobrem distância, usam limites exatos e rejeitam erros de valores', () => {
  const policy = defaultDriverSearchPolicy();
  policy.moto = { nearbyKm: 3, expandedKm: 15, allowExpansion: true, useCustomPickupFees: true,
    pickupFees: [{ upToKm: 3, amountCents: 0 }, { upToKm: 10, amountCents: 500 }, { upToKm: 15, amountCents: 900 }] };
  const checked = validateDriverSearchPolicy(policy);
  assert.equal(customPickupFee(checked.moto, 3), 0);
  assert.equal(customPickupFee(checked.moto, 3.001), 500);
  assert.equal(customPickupFee(checked.moto, 10.001), 900);
  assert.equal(customPickupFee(checked.car, 10), undefined);
  assert.throws(() => customPickupFee(checked.moto, 16));
  policy.moto.pickupFees.pop(); assert.throws(() => validateDriverSearchPolicy(policy));
  policy.moto.pickupFees.push({ upToKm: 15, amountCents: -1 }); assert.throws(() => validateDriverSearchPolicy(policy));
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pricingPeriodAt,
  RAMO_OPERATION_TIME_ZONE,
} from '../src/pricing/period.js';

test('período tarifário usa explicitamente o horário de Fortaleza', () => {
  assert.equal(RAMO_OPERATION_TIME_ZONE, 'America/Fortaleza');

  // UTC-3: 00:59Z = 21:59 local; 01:00Z = 22:00 local.
  assert.equal(
    pricingPeriodAt(new Date('2026-09-24T00:59:00.000Z')),
    'day',
  );
  assert.equal(
    pricingPeriodAt(new Date('2026-09-24T01:00:00.000Z')),
    'after_22',
  );

  // UTC-3: 08:59Z = 05:59 local; 09:00Z = 06:00 local.
  assert.equal(
    pricingPeriodAt(new Date('2026-09-24T08:59:00.000Z')),
    'after_22',
  );
  assert.equal(
    pricingPeriodAt(new Date('2026-09-24T09:00:00.000Z')),
    'day',
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { PAYMENT_POLICY_V1 } from '../src/payments/payment-policy.js';
import { STATIC_PRICING_CATALOG_V1 } from '../src/pricing/catalog-snapshot.js';
import { PricingError } from '../src/pricing/types.js';
import {
  pickupCompensationCents,
  quoteFare,
} from '../src/pricing/quote-engine.js';

const zone = (zoneId: 'jericoacoara' | 'jijoca' | 'prea' | 'external', localityId?: string) =>
  localityId == null ? { zoneId } : { zoneId, localityId };

test('Jeri <-> Preá aplica Carro R$130/R$150 e Comfort/Black R$150/R$190', () => {
  const car = quoteFare({
    origin: zone('prea'),
    destination: zone('jericoacoara'),
    category: 'car',
    period: 'day',
  });
  const day = quoteFare({
    origin: zone('prea'),
    destination: zone('jericoacoara'),
    category: 'comfort_black',
    period: 'day',
  });
  const night = quoteFare({
    origin: zone('jericoacoara'),
    destination: zone('prea'),
    category: 'comfort_black',
    period: 'after_22',
  });

  assert.equal(car.kind, 'exact');
  assert.equal(day.kind, 'exact');
  assert.equal(night.kind, 'exact');
  if (
    car.kind === 'exact' &&
    day.kind === 'exact' &&
    night.kind === 'exact'
  ) {
    assert.equal(car.totalAmountCents, 13000);
    assert.equal(day.totalAmountCents, 15000);
    assert.equal(night.totalAmountCents, 19000);
  }
});

test('Jijoca <-> Jeri fecha R$160 dia / R$200 após 22h', () => {
  const day = quoteFare({
    origin: zone('jijoca'),
    destination: zone('jericoacoara'),
    category: 'comfort_black',
    period: 'day',
  });
  const night = quoteFare({
    origin: zone('jijoca'),
    destination: zone('jericoacoara'),
    category: 'comfort_black',
    period: 'after_22',
  });

  assert.equal(day.kind, 'exact');
  assert.equal(night.kind, 'exact');
  if (day.kind === 'exact' && night.kind === 'exact') {
    assert.equal(day.totalAmountCents, 16000);
    assert.equal(night.totalAmountCents, 20000);
  }
});

test('transfer tarifado por zona reconhece localidades aprovadas sem trocar os valores comerciais', () => {
  for (const [category, expected] of [
    ['car', 13000],
    ['comfort_black', 15000],
    ['buggy', 11000],
  ] as const) {
    const result = quoteFare({
      origin: zone('prea', 'vila-prea'),
      destination: zone('jericoacoara', 'jericoacoara'),
      category,
      period: 'day',
      passengers: 1,
      tripDistanceKm: 12.1,
    });
    assert.equal(result.kind, 'exact');
    if (result.kind === 'exact') assert.equal(result.totalAmountCents, expected);
  }
  const reversed = quoteFare({
    origin: zone('jericoacoara', 'jericoacoara'),
    destination: zone('prea', 'prea-beach-villas'),
    category: 'car',
    period: 'after_22',
  });
  assert.equal(reversed.kind, 'exact');
  if (reversed.kind === 'exact') assert.equal(reversed.totalAmountCents, 15000);
});

test('rota local explícita mantém prioridade e localidade desconhecida não vira tarifa de zona', () => {
  const snapshot = structuredClone(STATIC_PRICING_CATALOG_V1);
  snapshot.fixedRoutes.unshift({
    id: 'prea-vila-specific', a: 'vila-prea', b: 'jericoacoara',
    category: 'car', dayCents: 17000, after22Cents: 19000,
  });
  const quote = quoteFare({
    origin: zone('prea', 'vila-prea'),
    destination: zone('jericoacoara', 'jericoacoara'),
    category: 'car', period: 'day',
  }, snapshot);
  assert.equal(quote.ruleId, 'prea-vila-specific');
  assert.throws(() => quoteFare({
    origin: zone('prea', 'unregistered-place'),
    destination: zone('jericoacoara'),
    category: 'car', period: 'day',
  }, snapshot), (error: unknown) =>
    error instanceof PricingError && error.code === 'UNKNOWN_LOCALITY');
  assert.throws(() => quoteFare({
    origin: zone('prea', 'vila-prea'),
    destination: zone('jericoacoara'),
    category: 'delivery', period: 'day', tripDistanceKm: 12.1,
  }, snapshot), (error: unknown) =>
    error instanceof PricingError && error.code === 'UNAVAILABLE_CATEGORY');
});

test('Preá <-> Jijoca oferece Carro e Comfort com adicional de R$30', () => {
  const car = quoteFare({
    origin: zone('prea'),
    destination: zone('jijoca'),
    category: 'car',
    period: 'day',
  });
  const comfort = quoteFare({
    origin: zone('prea'),
    destination: zone('jijoca'),
    category: 'comfort_black',
    period: 'day',
  });

  assert.equal(car.kind, 'exact');
  assert.equal(comfort.kind, 'exact');
  if (car.kind === 'exact' && comfort.kind === 'exact') {
    assert.equal(car.totalAmountCents, 12000);
    assert.equal(comfort.totalAmountCents, 15000);
  }
});

test('Aeroporto JJD respeita Carro/Comfort para Preá e apenas 4x4 para Jeri', () => {
  const airport = zone('external', 'airport-jjd');

  const carPrea = quoteFare({
    origin: airport,
    destination: zone('prea'),
    category: 'car',
    period: 'day',
  });
  const comfortPrea = quoteFare({
    origin: zone('prea'),
    destination: airport,
    category: 'comfort_black',
    period: 'day',
  });
  const comfortJeri = quoteFare({
    origin: airport,
    destination: zone('jericoacoara'),
    category: 'comfort_black',
    period: 'day',
  });

  assert.equal(carPrea.kind, 'exact');
  assert.equal(comfortPrea.kind, 'exact');
  assert.equal(comfortJeri.kind, 'exact');
  if (
    carPrea.kind === 'exact' &&
    comfortPrea.kind === 'exact' &&
    comfortJeri.kind === 'exact'
  ) {
    assert.equal(carPrea.totalAmountCents, 7000);
    assert.equal(comfortPrea.totalAmountCents, 9000);
    assert.equal(comfortJeri.totalAmountCents, 22000);
  }
});

test('Buggy em Jeri mantém o preço-base para 1 pessoa e soma R$2 só por adicional', () => {
  const single = quoteFare({
    origin: zone('jericoacoara'),
    destination: zone('jericoacoara'),
    category: 'buggy',
    period: 'day',
    passengers: 1,
  });
  const four = quoteFare({
    origin: zone('jericoacoara'),
    destination: zone('jericoacoara'),
    category: 'buggy',
    period: 'after_22',
    passengers: 4,
  });

  assert.equal(single.kind, 'exact');
  assert.equal(four.kind, 'exact');
  if (single.kind === 'exact' && four.kind === 'exact') {
    assert.equal(single.baseAmountCents, 3500);
    assert.equal(four.baseAmountCents, 5600);
  }
});

test('Entrega em Jeri custa R$5 até 2 km e R$6 acima, sem adicional noturno', () => {
  const local = quoteFare({
    origin: zone('jericoacoara'),
    destination: zone('jericoacoara'),
    category: 'delivery',
    period: 'day',
    tripDistanceKm: 1.5,
  });
  const above = quoteFare({
    origin: zone('jericoacoara'),
    destination: zone('jericoacoara'),
    category: 'delivery',
    period: 'after_22',
    tripDistanceKm: 2.4,
  });

  assert.equal(local.kind, 'exact');
  assert.equal(above.kind, 'exact');
  if (local.kind === 'exact' && above.kind === 'exact') {
    assert.equal(local.baseAmountCents, 500);
    assert.equal(above.baseAmountCents, 600);
  }
});

test('Comfort local do Preá soma R$25 e viagens longas preservam os valores aprovados', () => {
  const local = quoteFare({
    origin: zone('prea', 'prea'),
    destination: zone('prea', 'buraco-azul'),
    category: 'comfort_black',
    period: 'day',
  });
  const long = quoteFare({
    origin: zone('prea'),
    destination: zone('external', 'sobral'),
    category: 'comfort_black',
    period: 'day',
  });

  assert.equal(local.kind, 'exact');
  assert.equal(long.kind, 'exact');
  if (local.kind === 'exact' && long.kind === 'exact') {
    assert.equal(local.baseAmountCents, 6700);
    assert.equal(long.baseAmountCents, 67600);
  }
});

test('noturno local do Preá soma R$5, mas viagem longa mantém preço-base', () => {
  const local = quoteFare({
    origin: zone('prea', 'prea'),
    destination: zone('prea', 'buraco-azul'),
    category: 'car',
    period: 'after_22',
  });
  const long = quoteFare({
    origin: zone('prea'),
    destination: zone('external', 'sobral'),
    category: 'car',
    period: 'after_22',
  });

  assert.equal(local.kind, 'exact');
  assert.equal(long.kind, 'exact');
  if (local.kind === 'exact' && long.kind === 'exact') {
    assert.equal(local.baseAmountCents, 4700);
    assert.equal(long.baseAmountCents, 52000);
  }
});

test('Mourão tem tarifa exata aprovada de R$40/R$52', () => {
  for (const [period,amount] of [['day',4000],['after_22',5200]] as const) {
    const quote = quoteFare({origin:zone('jijoca','jijoca'),destination:zone('jijoca','corrego-do-mourao'),category:'moto',period});
    assert.equal(quote.kind,'exact');
    if (quote.kind === 'exact') assert.equal(quote.baseAmountCents,amount);
  }
});

test('coleta distante cobra só combustível excedente aos 8 km', () => {
  assert.equal(pickupCompensationCents('moto', 30), 600);
  assert.equal(pickupCompensationCents('car', 30), 1800);
  assert.equal(pickupCompensationCents('moto', 8), 0);
});

test('compensação de coleta é 100% do motorista e não sofre comissão', () => {
  const quote = quoteFare({
    origin: zone('jijoca', 'jijoca'),
    destination: zone('jijoca', 'mangue-seco'),
    category: 'moto',
    period: 'day',
    driverPickupDistanceKm: 30,
  });

  assert.equal(quote.kind, 'exact');
  if (quote.kind === 'exact') {
    assert.equal(quote.baseAmountCents, 6000);
    assert.equal(quote.pickupCompensationCents, 600);
    assert.equal(quote.totalAmountCents, 6600);
    assert.equal(quote.platformCommissionCents, 600);
    assert.equal(quote.driverNetCents, 6000);
  }
});

test('Entrega no Preá mantém o mesmo preço depois das 22h', () => {
  const day = quoteFare({
    origin: zone('prea', 'prea'),
    destination: zone('prea', 'buraco-azul'),
    category: 'delivery',
    period: 'day',
    tripDistanceKm: 6.5,
  });
  const night = quoteFare({
    origin: zone('prea', 'prea'),
    destination: zone('prea', 'buraco-azul'),
    category: 'delivery',
    period: 'after_22',
    tripDistanceKm: 6.5,
  });

  assert.equal(day.kind, 'exact');
  assert.equal(night.kind, 'exact');
  if (day.kind === 'exact' && night.kind === 'exact') {
    assert.equal(day.baseAmountCents, 750);
    assert.equal(night.baseAmountCents, 750);
  }
});

test('Moto Preá <-> Aeroporto custa R$60 dia e R$84 após 22h', () => {
  const airport = zone('external', 'airport-jjd');
  const day = quoteFare({
    origin: zone('prea'),
    destination: airport,
    category: 'moto',
    period: 'day',
  });
  const night = quoteFare({
    origin: airport,
    destination: zone('prea'),
    category: 'moto',
    period: 'after_22',
  });

  assert.equal(day.kind, 'exact');
  assert.equal(night.kind, 'exact');
  if (day.kind === 'exact' && night.kind === 'exact') {
    assert.equal(day.baseAmountCents, 6000);
    assert.equal(night.baseAmountCents, 8400);
  }
});

test('lançamento aceita somente Pix, cartão e carteira', () => {
  assert.deepEqual(PAYMENT_POLICY_V1.allowedMethods, ['pix', 'card', 'wallet']);
  assert.equal(PAYMENT_POLICY_V1.cashEnabled, false);
  assert.equal(PAYMENT_POLICY_V1.paymentRequiredBeforeDispatch, true);
  assert.equal(PAYMENT_POLICY_V1.futureCashDebtLimitCents, 12000);
});


test('regra da localidade pode desligar categoria sem apagar o preço salvo', () => {
  const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
  const policy = catalog.localityPolicies.prea['buraco-azul'];
  assert.ok(policy);
  policy.enabledCategories = policy.enabledCategories.filter(
    (category) => category !== 'car',
  );

  assert.equal(
    catalog.localities.prea['buraco-azul']?.car,
    4200,
  );
  assert.throws(
    () =>
      quoteFare(
        {
          origin: zone('prea', 'prea'),
          destination: zone('prea', 'buraco-azul'),
          category: 'car',
          period: 'day',
        },
        catalog,
      ),
    (error: unknown) =>
      error instanceof PricingError &&
      error.code === 'UNKNOWN_ROUTE',
  );
});

test('regra local controla adicional noturno do Preá', () => {
  const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
  const policy = catalog.localityPolicies.prea['buraco-azul'];
  assert.ok(policy);
  policy.applyNightSurcharge = false;

  const quote = quoteFare(
    {
      origin: zone('prea', 'prea'),
      destination: zone('prea', 'buraco-azul'),
      category: 'car',
      period: 'after_22',
    },
    catalog,
  );

  assert.equal(quote.kind, 'exact');
  if (quote.kind === 'exact') {
    assert.equal(quote.baseAmountCents, 4200);
  }
});



test('tarifas regionais só funcionam após configuração explícita, sem quebrar preço fixo', () => {
  const snapshot = structuredClone(STATIC_PRICING_CATALOG_V1);
  const ride = {
    origin: zone('prea', 'vila-prea'),
    destination: zone('prea', 'cavalo-bravo'),
    category: 'car' as const,
    period: 'day' as const,
    tripDistanceKm: 6.7,
  };
  assert.throws(() => quoteFare(ride, snapshot), (error: unknown) =>
    error instanceof PricingError && error.code === 'UNKNOWN_ROUTE');
  snapshot.distanceFarePolicies.push({
    id: 'regional-prea-car', scope: 'intra_zone',
    anchorZoneId: 'prea', anchorLocalityId: 'prea', category: 'car',
    coveredLocalityIds: ['vila-prea', 'cavalo-bravo', 'prea'],
    minKm: 2, maxKm: 12, minimumFareCents: 1800, pricePerKmCents: 300,
    after22MinimumFareCents: 2200, after22PricePerKmCents: 400,
  });
  const day = quoteFare(ride, snapshot);
  assert.equal(day.kind, 'exact');
  assert.equal(day.ruleId, 'regional-prea-car');
  if (day.kind === 'exact') assert.equal(day.baseAmountCents, 2010);
  const night = quoteFare({ ...ride, period: 'after_22' }, snapshot);
  assert.equal(night.kind, 'exact');
  if (night.kind === 'exact') assert.equal(night.baseAmountCents, 2680);
  const fixed = quoteFare({
    ...ride, origin: zone('prea', 'prea'), tripDistanceKm: 6.7,
  }, snapshot);
  assert.equal(fixed.ruleId, 'prea-cavalo-bravo-car');
  assert.throws(() => quoteFare({
    ...ride, destination: zone('prea', 'acarau'),
  }, snapshot), (error: unknown) =>
    error instanceof PricingError && error.code === 'UNKNOWN_ROUTE');
  assert.throws(() => quoteFare({
    ...ride, destination: zone('jijoca', 'jijoca'),
  }, snapshot), (error: unknown) =>
    error instanceof PricingError && error.code === 'UNKNOWN_ROUTE');
  assert.throws(() => quoteFare({
    ...ride, tripDistanceKm: 13,
  }, snapshot), (error: unknown) =>
    error instanceof PricingError && error.code === 'UNKNOWN_ROUTE');
  const { tripDistanceKm: _distance, ...withoutDistance } = ride;
  assert.throws(() => quoteFare(withoutDistance, snapshot), (error: unknown) =>
    error instanceof PricingError && error.code === 'MISSING_DISTANCE');
});

test('regional por quilômetro respeita categorias, lotação e localidade desativada', () => {
  const snapshot = structuredClone(STATIC_PRICING_CATALOG_V1);
  snapshot.distanceFarePolicies.push({
    id: 'regional-prea-buggy', scope: 'intra_zone',
    anchorZoneId: 'prea', anchorLocalityId: 'prea', category: 'buggy',
    coveredLocalityIds: ['vila-prea', 'cavalo-bravo'],
    minKm: 0, maxKm: 20, minimumFareCents: 2500, pricePerKmCents: 300,
    after22MinimumFareCents: 3000, after22PricePerKmCents: 400,
  });
  // Both localities must explicitly have Buggy enabled.
  snapshot.localityPolicies.prea['cavalo-bravo']!.enabledCategories =
    [...new Set([...snapshot.localityPolicies.prea['cavalo-bravo']!.enabledCategories, 'buggy' as const])];
  const trip = {
    origin: zone('prea', 'vila-prea'),
    destination: zone('prea', 'cavalo-bravo'),
    category: 'buggy' as const, period: 'after_22' as const,
    tripDistanceKm: 5, passengers: 3,
  };
  const quoted = quoteFare(trip, snapshot);
  assert.equal(quoted.kind, 'exact');
  if (quoted.kind === 'exact') assert.equal(quoted.baseAmountCents, 3400);
  snapshot.localityPolicies.prea['cavalo-bravo']!.enabledCategories =
    snapshot.localityPolicies.prea['cavalo-bravo']!.enabledCategories.filter(x=>x!=='buggy');
  assert.throws(() => quoteFare(trip, snapshot), (error: unknown) =>
    error instanceof PricingError && error.code === 'UNKNOWN_ROUTE');
});

test('preço específico continua tendo prioridade sobre fallback por distância', () => {
  const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
  catalog.distanceFarePolicies.push({
    id: 'distance-prea-prea-car',
    anchorZoneId: 'prea',
    anchorLocalityId: 'prea',
    category: 'car',
    minKm: 0,
    maxKm: 300,
    minimumFareCents: 1500,
    pricePerKmCents: 300,
  });

  const quote = quoteFare(
    {
      origin: zone('prea', 'prea'),
      destination: zone('external', 'sobral'),
      category: 'car',
      period: 'day',
      tripDistanceKm: 100,
    },
    catalog,
  );

  assert.equal(quote.kind, 'exact');
  if (quote.kind === 'exact') {
    assert.equal(quote.baseAmountCents, 52000);
    assert.notEqual(quote.ruleId, 'distance-prea-prea-car');
  }
});

test('ponto sem preço cadastrado usa distância real a partir da base', () => {
  const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
  catalog.distanceFarePolicies.push({
    id: 'distance-prea-prea-car',
    anchorZoneId: 'prea',
    anchorLocalityId: 'prea',
    category: 'car',
    minKm: 5,
    maxKm: 100,
    minimumFareCents: 2000,
    pricePerKmCents: 300,
  });

  const halfway = quoteFare(
    {
      origin: zone('prea', 'prea'),
      destination: zone('external'),
      category: 'car',
      period: 'day',
      tripDistanceKm: 10,
    },
    catalog,
  );
  assert.equal(halfway.kind, 'exact');
  if (halfway.kind === 'exact') {
    assert.equal(halfway.ruleId, 'distance-prea-prea-car');
    assert.equal(halfway.baseAmountCents, 3000);
  }

  const short = quoteFare(
    {
      origin: zone('prea', 'prea'),
      destination: zone('external'),
      category: 'car',
      period: 'day',
      tripDistanceKm: 2,
    },
    catalog,
  );
  assert.equal(short.kind, 'exact');
  if (short.kind === 'exact') {
    assert.equal(short.baseAmountCents, 2000);
  }

  assert.throws(
    () =>
      quoteFare(
        {
          origin: zone('prea', 'prea'),
          destination: zone('external'),
          category: 'car',
          period: 'day',
          tripDistanceKm: 101,
        },
        catalog,
      ),
    (error: unknown) =>
      error instanceof PricingError &&
      error.code === 'UNKNOWN_ROUTE',
  );
});

test('fallback por distância exige quilometragem quando nenhuma tarifa específica existe', () => {
  const catalog = structuredClone(STATIC_PRICING_CATALOG_V1);
  catalog.distanceFarePolicies.push({
    id: 'distance-prea-prea-moto',
    anchorZoneId: 'prea',
    anchorLocalityId: 'prea',
    category: 'moto',
    minKm: 0,
    maxKm: 80,
    minimumFareCents: 1000,
    pricePerKmCents: 200,
  });

  assert.throws(
    () =>
      quoteFare(
        {
          origin: zone('prea', 'prea'),
          destination: zone('external'),
          category: 'moto',
          period: 'day',
        },
        catalog,
      ),
    (error: unknown) =>
      error instanceof PricingError &&
      error.code === 'MISSING_DISTANCE',
  );
});

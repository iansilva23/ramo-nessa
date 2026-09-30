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

test('Jeri <-> Preá aplica Carro R$140 e Comfort/Black R$150/R$200', () => {
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
    assert.equal(car.totalAmountCents, 14000);
    assert.equal(day.totalAmountCents, 15000);
    assert.equal(night.totalAmountCents, 20000);
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

test('Preá <-> Jijoca oferece Carro e Comfort com adicional de R$50', () => {
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
    assert.equal(comfort.totalAmountCents, 17000);
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
    assert.equal(carPrea.totalAmountCents, 18000);
    assert.equal(comfortPrea.totalAmountCents, 23000);
    assert.equal(comfortJeri.totalAmountCents, 24000);
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
    assert.equal(single.baseAmountCents, 4000);
    assert.equal(four.baseAmountCents, 6600);
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

test('Comfort local do Preá soma R$40 e viagens longas preservam os valores aprovados', () => {
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
    assert.equal(local.baseAmountCents, 7500);
    assert.equal(long.baseAmountCents, 57000);
  }
});

test('noturno local do Preá soma R$10, mas viagem longa mantém preço-base', () => {
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
    assert.equal(local.baseAmountCents, 4500);
    assert.equal(long.baseAmountCents, 52000);
  }
});

test('faixas ainda não fechadas em Jijoca permanecem faixa e impedem falsa precisão', () => {
  const quote = quoteFare({
    origin: zone('jijoca', 'jijoca'),
    destination: zone('jijoca', 'corrego-do-mourao'),
    category: 'moto',
    period: 'day',
  });

  assert.equal(quote.kind, 'range');
  if (quote.kind === 'range') {
    assert.equal(quote.minBaseAmountCents, 3500);
    assert.equal(quote.maxBaseAmountCents, 4000);
    assert.equal(quote.requiresExactResolution, true);
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
  });
  const night = quoteFare({
    origin: zone('prea', 'prea'),
    destination: zone('prea', 'buraco-azul'),
    category: 'delivery',
    period: 'after_22',
  });

  assert.equal(day.kind, 'exact');
  assert.equal(night.kind, 'exact');
  if (day.kind === 'exact' && night.kind === 'exact') {
    assert.equal(day.baseAmountCents, 1900);
    assert.equal(night.baseAmountCents, 1900);
  }
});

test('Moto Preá <-> Aeroporto custa R$60 dia e R$80 após 22h', () => {
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
    assert.equal(night.baseAmountCents, 8000);
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
    3500,
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
    assert.equal(quote.baseAmountCents, 3500);
  }
});

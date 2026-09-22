import assert from 'node:assert/strict';
import test from 'node:test';

import { PAYMENT_POLICY_V1 } from '../src/payments/payment-policy.js';
import {
  pickupCompensationCents,
  quoteFare,
} from '../src/pricing/quote-engine.js';

const zone = (zoneId: 'jericoacoara' | 'jijoca' | 'prea' | 'external', localityId?: string) =>
  localityId == null ? { zoneId } : { zoneId, localityId };

test('Jeri <-> Preá é somente Comfort/Black por R$150 dia e R$200 após 22h', () => {
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

  assert.equal(day.kind, 'exact');
  assert.equal(night.kind, 'exact');
  if (day.kind === 'exact' && night.kind === 'exact') {
    assert.equal(day.totalAmountCents, 15000);
    assert.equal(night.totalAmountCents, 20000);
  }

  assert.throws(
    () =>
      quoteFare({
        origin: zone('prea'),
        destination: zone('jericoacoara'),
        category: 'car',
        period: 'day',
      }),
    /Não há tarifa v1/,
  );
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

test('Buggy em Jeri soma R$2 por passageiro', () => {
  const quote = quoteFare({
    origin: zone('jericoacoara'),
    destination: zone('jericoacoara'),
    category: 'buggy',
    period: 'after_22',
    passengers: 4,
  });

  assert.equal(quote.kind, 'exact');
  if (quote.kind === 'exact') {
    assert.equal(quote.baseAmountCents, 6800);
  }
});

test('Entrega em Jeri usa faixas de R$5 a R$10', () => {
  const quote = quoteFare({
    origin: zone('jericoacoara'),
    destination: zone('jericoacoara'),
    category: 'delivery',
    period: 'day',
    tripDistanceKm: 1.5,
  });

  assert.equal(quote.kind, 'exact');
  if (quote.kind === 'exact') {
    assert.equal(quote.baseAmountCents, 800);
  }
});

test('Comfort no Preá adiciona R$50 sobre carro quando permitido', () => {
  const quote = quoteFare({
    origin: zone('prea'),
    destination: zone('external', 'sobral'),
    category: 'comfort_black',
    period: 'day',
  });

  assert.equal(quote.kind, 'exact');
  if (quote.kind === 'exact') {
    assert.equal(quote.baseAmountCents, 57000);
  }
});

test('faixas ainda não fechadas permanecem faixa e impedem falsa precisão', () => {
  const quote = quoteFare({
    origin: zone('prea'),
    destination: zone('prea', 'formosa'),
    category: 'moto',
    period: 'day',
  });

  assert.equal(quote.kind, 'range');
  if (quote.kind === 'range') {
    assert.equal(quote.minBaseAmountCents, 800);
    assert.equal(quote.maxBaseAmountCents, 1000);
    assert.equal(quote.requiresExactResolution, true);
  }
});

test('coleta distante cobra só combustível excedente aos 3 km', () => {
  assert.equal(pickupCompensationCents('moto', 30), 700);
  assert.equal(pickupCompensationCents('car', 30), 2100);
  assert.equal(pickupCompensationCents('moto', 3), 0);
});

test('comissão de 10% incide sobre o total inclusive adicional', () => {
  const quote = quoteFare({
    origin: zone('jijoca'),
    destination: zone('jijoca', 'mangue-seco'),
    category: 'moto',
    period: 'day',
    driverPickupDistanceKm: 30,
  });

  assert.equal(quote.kind, 'exact');
  if (quote.kind === 'exact') {
    assert.equal(quote.baseAmountCents, 6000);
    assert.equal(quote.pickupCompensationCents, 700);
    assert.equal(quote.totalAmountCents, 6700);
    assert.equal(quote.platformCommissionCents, 670);
    assert.equal(quote.driverNetCents, 6030);
  }
});

test('lançamento aceita somente Pix, cartão e carteira', () => {
  assert.deepEqual(PAYMENT_POLICY_V1.allowedMethods, ['pix', 'card', 'wallet']);
  assert.equal(PAYMENT_POLICY_V1.cashEnabled, false);
  assert.equal(PAYMENT_POLICY_V1.paymentRequiredBeforeDispatch, true);
  assert.equal(PAYMENT_POLICY_V1.futureCashDebtLimitCents, 12000);
});

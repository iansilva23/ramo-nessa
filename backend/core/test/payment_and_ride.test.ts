import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canDispatchWithPayment,
  transitionPayment,
  type PaymentSnapshot,
} from '../src/payments/payment-state.js';
import {
  beginDriverSearch,
  markRidePaid,
  transitionRide,
} from '../src/rides/ride-state.js';
import { parseQuoteRequest } from '../src/pricing/validation.js';

test('cotação rejeita payload sem contrato válido', () => {
  assert.throws(
    () =>
      parseQuoteRequest({
        origin: { zoneId: 'prea' },
        destination: { zoneId: 'jericoacoara' },
        category: 'helicoptero',
        period: 'day',
      }),
    /category inválida/,
  );

  assert.throws(
    () =>
      parseQuoteRequest({
        origin: { zoneId: 'prea' },
        destination: { zoneId: 'jericoacoara' },
        category: 'comfort_black',
        period: 'day',
        passengers: 8,
      }),
    /passengers/,
  );
});

test('cotação válida mantém campos opcionais somente quando enviados', () => {
  const request = parseQuoteRequest({
    origin: { zoneId: 'prea', localityId: 'prea' },
    destination: { zoneId: 'external', localityId: 'sobral' },
    category: 'car',
    period: 'day',
    tripDistanceKm: 280,
  });

  assert.equal(request.origin.localityId, 'prea');
  assert.equal(request.destination.localityId, 'sobral');
  assert.equal(request.tripDistanceKm, 280);
  assert.equal(request.passengers, undefined);
});

test('pagamento autorizado ou pago libera despacho; pendente não', () => {
  assert.equal(canDispatchWithPayment('authorized'), true);
  assert.equal(canDispatchWithPayment('paid'), true);
  assert.equal(canDispatchWithPayment('pending'), false);
  assert.equal(canDispatchWithPayment('failed'), false);
});

test('máquina de pagamento bloqueia transições inválidas', () => {
  assert.equal(transitionPayment('created', 'pending'), 'pending');
  assert.equal(transitionPayment('pending', 'authorized'), 'authorized');
  assert.throws(
    () => transitionPayment('created', 'paid'),
    /Transição de pagamento inválida/,
  );
});

test('corrida não entra em matching sem pagamento garantido', () => {
  const pending: Pick<PaymentSnapshot, 'status' | 'amountCents'> = {
    status: 'pending',
    amountCents: 15000,
  };
  const paid: Pick<PaymentSnapshot, 'status' | 'amountCents'> = {
    status: 'paid',
    amountCents: 15000,
  };

  assert.throws(
    () => markRidePaid('AWAITING_PAYMENT', pending),
    /não autoriza despacho/,
  );

  const paidRide = markRidePaid('AWAITING_PAYMENT', paid);
  assert.equal(paidRide, 'PAID');
  assert.equal(beginDriverSearch(paidRide, paid), 'SEARCHING_DRIVER');
});

test('máquina de corrida impede pular estados críticos', () => {
  assert.equal(
    transitionRide('CREATED', 'AWAITING_PAYMENT'),
    'AWAITING_PAYMENT',
  );
  assert.throws(
    () => transitionRide('CREATED', 'SEARCHING_DRIVER'),
    /Transição de corrida inválida/,
  );
  assert.throws(
    () => transitionRide('DRIVER_ASSIGNED', 'COMPLETED'),
    /Transição de corrida inválida/,
  );
});

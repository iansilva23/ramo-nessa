import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RealtimeHub,
  type RealtimePeer,
} from '../src/realtime/realtime-hub.js';

class FakePeer implements RealtimePeer {
  readyState = 1;
  readonly messages: string[] = [];

  send(data: string): void {
    this.messages.push(data);
  }
}

test('hub entrega evento somente ao motorista inscrito', () => {
  const hub = new RealtimeHub();
  const one = new FakePeer();
  const two = new FakePeer();

  hub.subscribeDriver('driver-one', one);
  hub.subscribeDriver('driver-two', two);

  const delivered = hub.publishDriver('driver-one', {
    type: 'driver.offer.updated',
    offer: { id: 'offer-1' },
  });

  assert.equal(delivered, 1);
  assert.equal(one.messages.length, 1);
  assert.equal(two.messages.length, 0);
});

test('unsubscribe remove passageiro do tópico da corrida', () => {
  const hub = new RealtimeHub();
  const peer = new FakePeer();
  const unsubscribe = hub.subscribePassengerRide('ride-1', peer);

  unsubscribe();
  const delivered = hub.publishPassengerRide('ride-1', {
    type: 'passenger.ride.tracking',
  });

  assert.equal(delivered, 0);
  assert.equal(peer.messages.length, 0);
});

test('socket não aberto não recebe evento', () => {
  const hub = new RealtimeHub();
  const peer = new FakePeer();
  peer.readyState = 3;
  hub.subscribeDriver('driver-one', peer);

  assert.equal(
    hub.publishDriver('driver-one', { type: 'driver.offer.updated' }),
    0,
  );
  assert.equal(peer.messages.length, 0);
});

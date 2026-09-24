import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FcmPushDeliveryProvider,
  type FcmAccessTokenSource,
} from '../src/notifications/push-delivery-provider.js';

class FixedAccessTokenSource implements FcmAccessTokenSource {
  async getAccessToken(): Promise<string> {
    return 'oauth-test-token';
  }
}

test('FCM envia payload de corrida sem expor credencial no corpo', async () => {
  const calls: Array<{
    url: string;
    init: RequestInit | undefined;
  }> = [];
  const provider = new FcmPushDeliveryProvider(
    'ramo-test',
    new FixedAccessTokenSource(),
    async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ name: 'message-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  );

  const result = await provider.send({
    token: 'fcm-device-token-aaaaaaaaaaaaaaaa',
    tokenProvider: 'fcm',
    platform: 'android',
    message: {
      type: 'driver.offer.new',
      title: 'Nova corrida',
      body: 'Abra o app.',
      data: {
        rideId: 'ride-1',
        offerId: 'offer-1',
      },
    },
  });

  assert.deepEqual(result, { delivered: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /projects\/ramo-test\/messages:send$/);
  const headers = calls[0]!.init?.headers as Record<string, string>;
  assert.equal(headers.authorization, 'Bearer oauth-test-token');

  const payload = JSON.parse(String(calls[0]!.init?.body));
  assert.equal(payload.message.token, 'fcm-device-token-aaaaaaaaaaaaaaaa');
  assert.equal(payload.message.data.type, 'driver.offer.new');
  assert.equal(
    JSON.stringify(payload).includes('oauth-test-token'),
    false,
  );
});

test('FCM invalida token somente quando provider informa UNREGISTERED', async () => {
  const provider = new FcmPushDeliveryProvider(
    'ramo-test',
    new FixedAccessTokenSource(),
    async () => new Response(
      JSON.stringify({
        error: {
          status: 'NOT_FOUND',
          details: [{ errorCode: 'UNREGISTERED' }],
        },
      }),
      {
        status: 404,
        headers: { 'content-type': 'application/json' },
      },
    ),
  );

  assert.deepEqual(
    await provider.send({
      token: 'fcm-expired-token-bbbbbbbbbbbbbbbbb',
      tokenProvider: 'fcm',
      platform: 'ios',
      message: {
        type: 'passenger.ride.driver_arrived',
        title: 'Seu motorista chegou',
        body: 'O motorista está no embarque.',
      },
    }),
    { delivered: false, invalidToken: true },
  );
});

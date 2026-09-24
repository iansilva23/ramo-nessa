import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FcmPushDeliveryProvider,
  readFirebaseServiceAccountFile,
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


test('carrega credencial Firebase por arquivo montado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ramo-fcm-'));
  const path = join(dir, 'firebase.json');

  try {
    writeFileSync(
      path,
      JSON.stringify({
        project_id: 'ramo-nessa',
        client_email:
          'firebase-adminsdk@ramo-nessa.iam.gserviceaccount.com',
        private_key: 'x'.repeat(120),
      }),
      'utf8',
    );

    const credentials = readFirebaseServiceAccountFile(path);
    assert.equal(credentials.projectId, 'ramo-nessa');
    assert.equal(
      credentials.clientEmail,
      'firebase-adminsdk@ramo-nessa.iam.gserviceaccount.com',
    );
    assert.equal(credentials.privateKey.length, 120);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejeita arquivo Firebase incompleto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ramo-fcm-'));
  const path = join(dir, 'firebase.json');

  try {
    writeFileSync(
      path,
      JSON.stringify({ project_id: 'ramo-nessa' }),
      'utf8',
    );
    assert.throws(
      () => readFirebaseServiceAccountFile(path),
      /não contém credenciais Firebase válidas/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

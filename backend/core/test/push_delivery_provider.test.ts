import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePushDeliveryProviderFromEnv } from '../src/notifications/push-delivery-provider.js';
import { parsePushDeviceRegistration } from '../src/notifications/push-device-validation.js';

function withPushEnv(
  values: Readonly<Record<string, string | undefined>>,
  action: () => void,
) {
  const names = [
    'PUSH_PROVIDER',
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'FIREBASE_SERVICE_ACCOUNT_FILE',
  ] as const;
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );

  try {
    for (const name of names) {
      const value = values[name];
      if (value == null) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    action();
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value == null) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

test('cadastro de dispositivo aceita token FCM', () => {
  const parsed = parsePushDeviceRegistration({
    platform: 'android',
    provider: 'fcm',
    token: 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaa',
    appVersion: '0.1.0',
    buildNumber: 1,
  });

  assert.equal(parsed.provider, 'fcm');
  assert.equal(parsed.platform, 'android');
  assert.equal(parsed.buildNumber, 1);
});

test('resolver expõe provider FCM quando service account está configurada', () => {
  withPushEnv(
    {
      PUSH_PROVIDER: 'fcm',
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: 'ramo-nessa-prod',
        client_email:
          'firebase-adminsdk@ramo-nessa-prod.iam.gserviceaccount.com',
        private_key:
          '-----BEGIN PRIVATE KEY-----\\nfixture\\n-----END PRIVATE KEY-----',
      }),
      FIREBASE_SERVICE_ACCOUNT_FILE: undefined,
    },
    () => {
      const provider = resolvePushDeliveryProviderFromEnv();
      assert.equal(provider.kind, 'fcm');
    },
  );
});

test('resolver FCM falha fechado sem credencial administrativa', () => {
  withPushEnv(
    {
      PUSH_PROVIDER: 'fcm',
      FIREBASE_SERVICE_ACCOUNT_JSON: undefined,
      FIREBASE_SERVICE_ACCOUNT_FILE: undefined,
    },
    () => {
      assert.throws(
        () => resolvePushDeliveryProviderFromEnv(),
        /FIREBASE_SERVICE_ACCOUNT_JSON|FIREBASE_SERVICE_ACCOUNT_FILE/,
      );
    },
  );
});

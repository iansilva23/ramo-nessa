import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OtpDeliveryError,
  WebhookOtpDeliveryProvider,
  resolveOtpDeliveryProviderFromEnv,
} from '../src/auth/otp-delivery-provider.js';

test('produção rejeita provider OTP de desenvolvimento', () => {
  assert.throws(
    () =>
      resolveOtpDeliveryProviderFromEnv({
        NODE_ENV: 'production',
        OTP_PROVIDER: 'dev',
      }),
    /OTP_PROVIDER=webhook/,
  );
});

test('webhook OTP exige HTTPS e token adequado', () => {
  assert.throws(
    () =>
      resolveOtpDeliveryProviderFromEnv({
        NODE_ENV: 'production',
        OTP_PROVIDER: 'webhook',
        OTP_WEBHOOK_URL: 'http://example.com/otp',
        OTP_WEBHOOK_TOKEN: 'abcdefghijklmnopqrstuvwxyz123456',
      }),
    /HTTPS/,
  );

  assert.throws(
    () =>
      resolveOtpDeliveryProviderFromEnv({
        NODE_ENV: 'production',
        OTP_PROVIDER: 'webhook',
        OTP_WEBHOOK_URL: 'https://example.com/otp',
        OTP_WEBHOOK_TOKEN: 'short',
      }),
    /obrigatórios/,
  );
});

test('webhook OTP envia contrato versionado, Bearer e chave idempotente', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedInit: RequestInit = {};

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    capturedUrl = String(input);
    capturedInit = init ?? {};
    return new Response('', { status: 202 });
  }) as typeof fetch;

  try {
    const provider = new WebhookOtpDeliveryProvider(
      new URL('https://sms.example.com/v1/otp'),
      'provider-token-abcdefghijklmnopqrstuvwxyz',
    );

    await provider.sendCode({
      phoneE164: '+5588999991234',
      code: '123456',
      challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresInSeconds: 300,
    });

    assert.equal(capturedUrl, 'https://sms.example.com/v1/otp');
    assert.equal(capturedInit.method, 'POST');

    const headers = new Headers(capturedInit.headers);
    assert.equal(
      headers.get('authorization'),
      'Bearer provider-token-abcdefghijklmnopqrstuvwxyz',
    );
    assert.equal(
      headers.get('idempotency-key'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    assert.equal(headers.get('x-ramo-nessa-webhook-version'), '1');

    const body = JSON.parse(String(capturedInit.body)) as {
      phoneE164: string;
      code: string;
      challengeId: string;
      expiresInSeconds: number;
    };
    assert.deepEqual(body, {
      phoneE164: '+5588999991234',
      code: '123456',
      challengeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresInSeconds: 300,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('webhook OTP converte HTTP não-2xx e indisponibilidade em erro seguro', async () => {
  const originalFetch = globalThis.fetch;
  const provider = new WebhookOtpDeliveryProvider(
    new URL('https://sms.example.com/v1/otp'),
    'provider-token-abcdefghijklmnopqrstuvwxyz',
  );

  try {
    globalThis.fetch = (async () =>
      new Response('', { status: 503 })) as typeof fetch;

    await assert.rejects(
      () =>
        provider.sendCode({
          phoneE164: '+5588999991234',
          code: '123456',
          challengeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          expiresInSeconds: 300,
        }),
      (error: unknown) =>
        error instanceof OtpDeliveryError &&
        /HTTP 503/.test(error.message),
    );

    globalThis.fetch = (async () => {
      throw new TypeError('network down');
    }) as typeof fetch;

    await assert.rejects(
      () =>
        provider.sendCode({
          phoneE164: '+5588999991234',
          code: '123456',
          challengeId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          expiresInSeconds: 300,
        }),
      (error: unknown) =>
        error instanceof OtpDeliveryError &&
        error.message === 'Provider OTP está indisponível.',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import type { OtpDeliveryProvider } from '../src/auth/otp-delivery-provider.js';
import {
  normalizeBrazilMobilePhone,
  PhoneOtpError,
  requestPhoneOtp,
  verifyPhoneOtp,
} from '../src/auth/phone-otp-service.js';

class RecordingDelivery implements OtpDeliveryProvider {
  readonly sent: Array<{
    phoneE164: string;
    code: string;
    challengeId: string;
  }> = [];

  async sendCode(input: {
    phoneE164: string;
    code: string;
    challengeId: string;
  }): Promise<void> {
    this.sent.push(input);
  }
}

class FailingDelivery implements OtpDeliveryProvider {
  async sendCode(): Promise<void> {
    throw new Error('sms provider down');
  }
}

test('normaliza celular brasileiro para E.164', () => {
  assert.equal(
    normalizeBrazilMobilePhone('(88) 99999-1234'),
    '+5588999991234',
  );
  assert.equal(
    normalizeBrazilMobilePhone('+55 88 99999-1234'),
    '+5588999991234',
  );
  assert.throws(
    () => normalizeBrazilMobilePhone('1234'),
    (error: unknown) =>
      error instanceof PhoneOtpError && error.code === 'INVALID_PHONE',
  );
});

test('passageiro confirma OTP e recebe sessão Bearer sem reutilizar código', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const delivery = new RecordingDelivery();
  const now = new Date('2026-09-23T10:10:00.000Z');

  const requested = await requestPhoneOtp({
    repository,
    delivery,
    subjectType: 'passenger',
    phone: '(88) 99999-1234',
    now,
  });

  assert.equal(delivery.sent.length, 1);
  assert.equal(delivery.sent[0]?.phoneE164, '+5588999991234');
  assert.equal(delivery.sent[0]?.challengeId, requested.challengeId);
  assert.match(delivery.sent[0]?.code ?? '', /^\d{6}$/);

  const verified = await verifyPhoneOtp({
    repository,
    sessions,
    challengeId: requested.challengeId,
    code: delivery.sent[0]!.code,
    now: new Date('2026-09-23T10:10:30.000Z'),
  });

  assert.equal(verified.tokenType, 'Bearer');
  assert.equal(verified.subjectType, 'passenger');
  assert.ok(verified.accessToken.length >= 32);

  await assert.rejects(
    () =>
      verifyPhoneOtp({
        repository,
        sessions,
        challengeId: requested.challengeId,
        code: delivery.sent[0]!.code,
        now: new Date('2026-09-23T10:10:40.000Z'),
      }),
    (error: unknown) =>
      error instanceof PhoneOtpError &&
      error.code === 'OTP_INVALID_OR_EXPIRED',
  );
});

test('OTP respeita cooldown e limite de tentativas', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const delivery = new RecordingDelivery();
  const now = new Date('2026-09-23T10:20:00.000Z');

  const requested = await requestPhoneOtp({
    repository,
    delivery,
    subjectType: 'passenger',
    phone: '88999991235',
    now,
  });

  await assert.rejects(
    () =>
      requestPhoneOtp({
        repository,
        delivery,
        subjectType: 'passenger',
        phone: '88999991235',
        now: new Date('2026-09-23T10:20:30.000Z'),
      }),
    (error: unknown) =>
      error instanceof PhoneOtpError &&
      error.code === 'OTP_RATE_LIMITED',
  );

  const correct = delivery.sent[0]!.code;
  const wrong = correct === '000000' ? '000001' : '000000';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      () =>
        verifyPhoneOtp({
          repository,
          sessions,
          challengeId: requested.challengeId,
          code: wrong,
          now: new Date(
            Date.parse('2026-09-23T10:20:10.000Z') + attempt * 1000,
          ),
        }),
      (error: unknown) =>
        error instanceof PhoneOtpError &&
        error.code === 'OTP_INVALID_OR_EXPIRED',
    );
  }

  await assert.rejects(
    () =>
      verifyPhoneOtp({
        repository,
        sessions,
        challengeId: requested.challengeId,
        code: correct,
        now: new Date('2026-09-23T10:20:20.000Z'),
      }),
    (error: unknown) =>
      error instanceof PhoneOtpError &&
      error.code === 'OTP_INVALID_OR_EXPIRED',
  );
});

test('motorista não cadastrado recebe resposta opaca sem SMS', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const delivery = new RecordingDelivery();
  const now = new Date('2026-09-23T10:25:00.000Z');

  const requested = await requestPhoneOtp({
    repository,
    delivery,
    subjectType: 'driver',
    phone: '88999991236',
    now,
  });

  assert.ok(requested.challengeId.length > 20);
  assert.equal(requested.retryAfterSeconds, 60);
  assert.equal(delivery.sent.length, 0);

  await assert.rejects(
    () =>
      verifyPhoneOtp({
        repository,
        sessions,
        challengeId: requested.challengeId,
        code: '123456',
        now: new Date('2026-09-23T10:25:10.000Z'),
      }),
    (error: unknown) =>
      error instanceof PhoneOtpError &&
      error.code === 'OTP_INVALID_OR_EXPIRED',
  );
});

test('motorista suspenso também recebe resposta opaca sem SMS', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const delivery = new RecordingDelivery();
  const now = new Date('2026-09-23T10:26:00.000Z');

  await repository.createIdentity({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    subjectId: 'driver-suspended-otp',
    subjectType: 'driver',
    phoneE164: '+5588999991243',
    status: 'suspended',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const requested = await requestPhoneOtp({
    repository,
    delivery,
    subjectType: 'driver',
    phone: '88999991243',
    now,
  });

  assert.ok(requested.challengeId.length > 20);
  assert.equal(requested.retryAfterSeconds, 60);
  assert.equal(delivery.sent.length, 0);
});

test('motorista previamente aprovado pode autenticar por OTP', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const delivery = new RecordingDelivery();
  const now = new Date('2026-09-23T10:30:00.000Z');

  await repository.createIdentity({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    subjectId: 'driver-approved-001',
    subjectType: 'driver',
    phoneE164: '+5588999991237',
    status: 'active',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  const requested = await requestPhoneOtp({
    repository,
    delivery,
    subjectType: 'driver',
    phone: '88999991237',
    now,
  });
  const verified = await verifyPhoneOtp({
    repository,
    sessions,
    challengeId: requested.challengeId,
    code: delivery.sent[0]!.code,
    now: new Date('2026-09-23T10:30:20.000Z'),
  });

  assert.equal(verified.subjectId, 'driver-approved-001');
  assert.equal(verified.subjectType, 'driver');
});

test('falha de entrega invalida desafio e permite tentar novamente', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const now = new Date('2026-09-23T10:40:00.000Z');

  await assert.rejects(
    () =>
      requestPhoneOtp({
        repository,
        delivery: new FailingDelivery(),
        subjectType: 'passenger',
        phone: '88999991238',
        now,
      }),
    (error: unknown) =>
      error instanceof PhoneOtpError &&
      error.code === 'OTP_DELIVERY_FAILED',
  );

  const delivery = new RecordingDelivery();
  const retry = await requestPhoneOtp({
    repository,
    delivery,
    subjectType: 'passenger',
    phone: '88999991238',
    now: new Date('2026-09-23T10:40:01.000Z'),
  });

  assert.ok(retry.challengeId.length > 20);
  assert.equal(delivery.sent.length, 1);
});


test('novo OTP após cooldown invalida o desafio anterior', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const sessions = new InMemoryAuthSessionRepository();
  const firstDelivery = new RecordingDelivery();
  const secondDelivery = new RecordingDelivery();

  const first = await requestPhoneOtp({
    repository,
    delivery: firstDelivery,
    subjectType: 'passenger',
    phone: '88999991239',
    now: new Date('2026-09-23T10:50:00.000Z'),
  });

  const second = await requestPhoneOtp({
    repository,
    delivery: secondDelivery,
    subjectType: 'passenger',
    phone: '88999991239',
    now: new Date('2026-09-23T10:51:01.000Z'),
  });

  await assert.rejects(
    () =>
      verifyPhoneOtp({
        repository,
        sessions,
        challengeId: first.challengeId,
        code: firstDelivery.sent[0]!.code,
        now: new Date('2026-09-23T10:51:10.000Z'),
      }),
    (error: unknown) =>
      error instanceof PhoneOtpError &&
      error.code === 'OTP_INVALID_OR_EXPIRED',
  );

  const verified = await verifyPhoneOtp({
    repository,
    sessions,
    challengeId: second.challengeId,
    code: secondDelivery.sent[0]!.code,
    now: new Date('2026-09-23T10:51:10.000Z'),
  });
  assert.equal(verified.subjectType, 'passenger');
});


test('requisições OTP simultâneas para o mesmo telefone geram só um desafio', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const delivery = new RecordingDelivery();
  const now = new Date('2026-09-23T12:10:00.000Z');

  const results = await Promise.allSettled([
    requestPhoneOtp({
      repository,
      delivery,
      subjectType: 'passenger',
      phone: '88999991242',
      now,
    }),
    requestPhoneOtp({
      repository,
      delivery,
      subjectType: 'passenger',
      phone: '88999991242',
      now,
    }),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(delivery.sent.length, 1);

  const rejected = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  assert.ok(rejected);
  assert.ok(rejected.reason instanceof PhoneOtpError);
  assert.equal(rejected.reason.code, 'OTP_RATE_LIMITED');
});

test('rate-limit por dispositivo bloqueia flood entre telefones diferentes', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const delivery = new RecordingDelivery();
  const context = {
    clientIp: '203.0.113.10',
    clientInstanceId: 'device-auth-test-0000000001',
  };
  const base = Date.parse('2026-09-23T13:00:00.000Z');

  for (let index = 0; index < 20; index += 1) {
    const phone = String(88910000000 + index);
    await requestPhoneOtp({
      repository,
      delivery,
      subjectType: 'passenger',
      phone,
      context,
      now: new Date(base + index * 1000),
    });
  }

  await assert.rejects(
    () =>
      requestPhoneOtp({
        repository,
        delivery,
        subjectType: 'passenger',
        phone: '88910000020',
        context,
        now: new Date(base + 21_000),
      }),
    (error: unknown) =>
      error instanceof PhoneOtpError &&
      error.code === 'OTP_RATE_LIMITED',
  );
  assert.equal(delivery.sent.length, 20);
});

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

test('motorista não cadastrado não recebe desafio OTP', async () => {
  const repository = new InMemoryAuthOtpRepository();
  const delivery = new RecordingDelivery();

  await assert.rejects(
    () =>
      requestPhoneOtp({
        repository,
        delivery,
        subjectType: 'driver',
        phone: '88999991236',
      }),
    (error: unknown) =>
      error instanceof PhoneOtpError &&
      error.code === 'DRIVER_NOT_REGISTERED',
  );

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

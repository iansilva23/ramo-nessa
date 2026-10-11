import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { EntrarWhatsAppOtpProvider } from '../src/auth/entrar-whatsapp-otp-provider.js';
import { resolveOtpDeliveryProviderFromEnv, OtpDeliveryError, type OtpDeliveryProvider } from '../src/auth/otp-delivery-provider.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { PostgresAuthOtpRepository } from '../src/auth/repositories/postgres-auth-otp-repository.js';
import { PostgresAuthSessionRepository } from '../src/auth/repositories/postgres-auth-session-repository.js';
import { createPostgresPool } from '../src/db/postgres.js';
import { PhoneOtpError, requestPhoneOtp, verifyPhoneOtp } from '../src/auth/phone-otp-service.js';
import type { AuthOtpRepository } from '../src/auth/auth-otp-repository.js';
import type { AuthSessionRepository } from '../src/auth/auth-session-repository.js';
import { adminIntegrationSetupView } from '../src/admin/admin-integrations-service.js';
class RemoteOtp implements OtpDeliveryProvider {
  readonly externalProvider = 'entrar-whatsapp' as const;
  sent = 0; verified = 0; failSend = false; failVerify = false; gate?: Promise<void>;
  async sendCode(): Promise<{ reference: string }> {
    this.sent++; if (this.failSend) throw new Error('SECRET');
    return { reference: 'remote-' + this.sent };
  }
  async verifyCode(input: { reference: string; code: string }): Promise<boolean> {
    this.verified++; if (this.gate) await this.gate;
    if (this.failVerify) throw new Error('SECRET');
    return input.code === '123456';
  }
}
const start = new Date('2026-10-02T18:00:00Z');
const errorCode = (code: string) => (e: unknown) => e instanceof PhoneOtpError && e.code === code;
async function setup(repository: AuthOtpRepository = new InMemoryAuthOtpRepository(), sessions: AuthSessionRepository = new InMemoryAuthSessionRepository(), phone = '88999991111') {
  const delivery = new RemoteOtp();
  const request = () => requestPhoneOtp({ repository, delivery, phone, subjectType: 'passenger', now: start });
  const requested = await request();
  const verify = (code = '123456', now = new Date(start.getTime() + 1000)) => verifyPhoneOtp({ repository, sessions, delivery, challengeId: requested.challengeId, code, now });
  return { repository, delivery, requested, request, verify };
}
test('Entrar envia apenas telefone e valida booleans estritos sem retry ou vazamento', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  let body: unknown = { ok: true, otpId: 'provider-id', status: 'pending' }; let status = 200;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init: init! }); return new Response(JSON.stringify(body), { status }); };
  try {
    const p = new EntrarWhatsAppOtpProvider('test-secret');
    assert.deepEqual(await p.sendCode({ phoneE164: '+5588999991111' }), { reference: 'provider-id' });
    assert.equal(calls[0]!.url, 'https://cpf.entrar.api.br/api/otp/send');
    assert.equal(calls[0]!.init.redirect, 'error');
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { telefone: '+5588999991111' });
    assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, 'Bearer test-secret');
    for (const response of [{ ok: true, verified: true }, { ok: false, verified: true }, { ok: true, verified: 'true' }, { verified: true }]) {
      body = response; assert.equal(await p.verifyCode({ reference: 'provider-id', code: '123456' }), response.ok === true && response.verified === true);
    }
    assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), { otpId: 'provider-id', codigo: '123456' });
    for (const response of [{ ok: true }, { ok: true, otpId: '', status: 'pending' }, { ok: true, otpId: 'x', status: 'failed' }]) {
      body = response; await assert.rejects(p.sendCode({ phoneE164: '+5588999991111' }), OtpDeliveryError);
    }
    status = 503; body = { secret: 'DO NOT EXPOSE' }; const before = calls.length;
    await assert.rejects(p.sendCode({ phoneE164: '+5588999991111' }), (e: unknown) => e instanceof OtpDeliveryError && !e.message.includes('DO NOT EXPOSE'));
    assert.equal(calls.length, before + 1);
    globalThis.fetch = async () => { throw new Error('test-secret'); };
    await assert.rejects(p.verifyCode({ reference: 'x', code: '123456' }), (e: unknown) => e instanceof OtpDeliveryError && !e.message.includes('test-secret'));
  } finally { globalThis.fetch = original; }
});
test('WhatsApp exige credencial privada e admin não revela o segredo', () => {
  assert.throws(() => resolveOtpDeliveryProviderFromEnv({ OTP_PROVIDER: 'entrar-whatsapp' }), /ENTRAR_API_SECRET/);
  assert.throws(() => resolveOtpDeliveryProviderFromEnv({ OTP_PROVIDER: 'entrar-whatsapp', ENTRAR_API_SECRET: 'bad\nsecret' }));
  const env = { NODE_ENV: 'production', OTP_PROVIDER: 'entrar-whatsapp', ENTRAR_API_SECRET: 'private-test-secret' };
  assert.equal(resolveOtpDeliveryProviderFromEnv(env)?.externalProvider, 'entrar-whatsapp');
  const status = adminIntegrationSetupView(env);
  assert.equal(status.otp.productionReady, true); assert.equal(status.otp.tokenEnvironmentVariable, 'ENTRAR_API_SECRET');
  assert.ok(!JSON.stringify(status).includes('private-test-secret'));
});
async function securityScenario(repository?: AuthOtpRepository, sessions?: AuthSessionRepository, phone?: string) {
  const s = await setup(repository, sessions, phone);
  assert.equal(s.requested.devCode, undefined); assert.ok(!JSON.stringify(s.requested).includes('remote-'));
  const saved = await s.repository.findChallengeById(s.requested.challengeId);
  assert.equal(saved?.externalProvider, 'entrar-whatsapp'); assert.equal(saved?.externalReference, 'remote-1');
  await assert.rejects(s.request(), errorCode('OTP_RATE_LIMITED')); assert.equal(s.delivery.sent, 1);
  assert.equal(await s.repository.attemptChallenge({ challengeId: s.requested.challengeId, codeDigest: saved!.codeDigest, attemptedAt: start.toISOString(), maxAttempts: 5 }), null);
  await assert.rejects(s.verify('000000'), errorCode('OTP_INVALID_OR_EXPIRED'));
  assert.equal((await s.verify()).subjectType, 'passenger');
  await assert.rejects(s.verify(), errorCode('OTP_INVALID_OR_EXPIRED')); assert.equal(s.delivery.verified, 2);
}
test('WhatsApp preserva cooldown e rejeita bypass, código errado e reutilização', () => securityScenario());
test('limita a cinco verificações; quinta tentativa correta funciona', async () => {
  const s = await setup();
  for (let i = 0; i < 4; i++) await assert.rejects(s.verify('000000'), errorCode('OTP_INVALID_OR_EXPIRED'));
  await s.verify(); const blocked = await setup();
  for (let i = 0; i < 5; i++) await assert.rejects(blocked.verify('000000'), errorCode('OTP_INVALID_OR_EXPIRED'));
  await assert.rejects(blocked.verify(), errorCode('OTP_INVALID_OR_EXPIRED')); assert.equal(blocked.delivery.verified, 5);
});
test('expiração local bloqueia a chamada externa', async () => {
  const s = await setup(); await assert.rejects(s.verify('123456', new Date(start.getTime() + 300000)), errorCode('OTP_INVALID_OR_EXPIRED'));
  assert.equal(s.delivery.verified, 0);
});
test('concorrência reserva apenas uma verificação e uma sessão', async () => {
  const s = await setup(); let release!: () => void; s.delivery.gate = new Promise<void>(r => { release = r; });
  const first = s.verify(); while (s.delivery.verified === 0) await new Promise(r => setImmediate(r));
  await assert.rejects(s.verify(), errorCode('OTP_INVALID_OR_EXPIRED')); release(); await first;
  assert.equal(s.delivery.verified, 1); await assert.rejects(s.verify(), errorCode('OTP_INVALID_OR_EXPIRED'));
});
test('falha externa libera a reserva; falha de envio cancela desafio', async () => {
  const s = await setup(); s.delivery.failVerify = true; await assert.rejects(s.verify(), errorCode('OTP_DELIVERY_FAILED'));
  s.delivery.failVerify = false; await s.verify();
  const repo = new InMemoryAuthOtpRepository(), delivery = new RemoteOtp(); delivery.failSend = true;
  await assert.rejects(requestPhoneOtp({ repository: repo, delivery, phone: '88999991111', subjectType: 'passenger', now: start }), errorCode('OTP_DELIVERY_FAILED'));
  const identity = await repo.findIdentityByPhone('passenger', '+5588999991111');
  assert.ok((await repo.findLatestChallengeByIdentityId(identity!.id))?.consumedAt);
});
test('lease abandonada pode ser recuperada sem aceitar dono anterior', async () => {
  const s = await setup(), a = randomUUID(), b = randomUUID();
  await s.repository.beginExternalVerification({ challengeId: s.requested.challengeId, nonce: a, attemptedAt: start.toISOString(), leaseUntil: new Date(start.getTime() + 15000).toISOString(), maxAttempts: 5 });
  const later = new Date(start.getTime() + 16000).toISOString();
  assert.ok(await s.repository.beginExternalVerification({ challengeId: s.requested.challengeId, nonce: b, attemptedAt: later, leaseUntil: new Date(start.getTime() + 31000).toISOString(), maxAttempts: 5 }));
  assert.equal(await s.repository.finishExternalVerification({ challengeId: s.requested.challengeId, nonce: a, verified: true, completedAt: later }), null);
  assert.equal((await s.repository.finishExternalVerification({ challengeId: s.requested.challengeId, nonce: b, verified: true, completedAt: later }))?.matched, true);
});
test('motorista não cadastrado não dispara WhatsApp nem revela cadastro', async () => {
  const delivery = new RemoteOtp(); const result = await requestPhoneOtp({ repository: new InMemoryAuthOtpRepository(), delivery, phone: '88999991111', subjectType: 'driver', now: start });
  assert.equal(delivery.sent, 0); assert.ok(result.challengeId); assert.equal(result.devCode, undefined);
});
test('PostgreSQL persiste referência externa e bloqueia bypass e replay', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = createPostgresPool(process.env.DATABASE_URL!), repository = new PostgresAuthOtpRepository(pool);
  try { await securityScenario(repository, new PostgresAuthSessionRepository(pool), '88999997654'); }
  finally {
    const identity = await repository.findIdentityByPhone('passenger', '+5588999997654');
    if (identity) {
      await pool.query('DELETE FROM auth_sessions WHERE subject_id = $1', [identity.subjectId]);
      await pool.query('DELETE FROM auth_otp_challenges WHERE identity_id = $1', [identity.id]);
      await pool.query('DELETE FROM auth_identities WHERE id = $1', [identity.id]);
    } await pool.end();
  }
});

test('reserva não aceita resultado depois de expirar nem verifica código local durante envio', async () => {
  const s = await setup(); const nonce = randomUUID();
  await s.repository.beginExternalVerification({ challengeId: s.requested.challengeId, nonce, attemptedAt: start.toISOString(), leaseUntil: new Date(start.getTime() + 15000).toISOString(), maxAttempts: 5 });
  assert.equal((await s.repository.finishExternalVerification({ challengeId: s.requested.challengeId, nonce, verified: true, completedAt: new Date(start.getTime() + 16000).toISOString() }))?.matched, false);
  const challenge = await s.repository.findChallengeById(s.requested.challengeId);
  assert.equal(challenge?.consumedAt, undefined);
  assert.equal(challenge?.verificationNonce, undefined);
});

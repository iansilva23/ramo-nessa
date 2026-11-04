import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { hashBearerToken } from '../src/auth/auth-service.js';
import type { AuthIdentityRepository } from '../src/auth/auth-identity-repository.js';
import type { AuthSessionRepository } from '../src/auth/auth-session-repository.js';
import { hashPassengerPassword } from '../src/auth/passenger-password-auth-service.js';
import { handlePasswordRecoveryRoute } from '../src/auth/password-recovery-routes.js';
import type { PostgresPasswordRecoveryStore } from '../src/auth/password-recovery-store.js';
import { recoveryDeliveryFromEnv, type RecoveryChannel } from '../src/auth/recovery-delivery.js';

test('recovery never sends to an unconfirmed contact and accepts the selected channel only', async () => {
  const password = 'current-pass123';
  const account = {
    id: 'test-id', subject_id: 'test-subject', subject_type: 'driver' as const,
    email_normalized: 'driver@example.test', phone_e164: '+5588999990000',
    password: await hashPassengerPassword(password),
  };
  const token = 'test-session-token-for-recovery';
  const session = {
    id: 'test-session-id', subjectId: account.subject_id, subjectType: account.subject_type,
    tokenHash: hashBearerToken(token), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  type Challenge = NonNullable<Awaited<ReturnType<PostgresPasswordRecoveryStore['claim']>>>;
  const challenges = new Map<string, Challenge>();
  const verified = new Set<RecoveryChannel>();
  const limits: { key: string; limit: number; windowMs: number }[][] = [];
  let rejectRateLimit = false;
  const deliveries: { channel: RecoveryChannel; destination: string; code: string }[] = [];
  const store = {
    async takeLimit(rules: { key: string; limit: number; windowMs: number }[]) {
      limits.push(rules);
      return { allowed: !rejectRateLimit, retryAfterMs: rejectRateLimit ? 12_000 : 0 };
    },
    async account(role: string, identifier: string, subjectId?: string) {
      if (role === account.subject_type && (identifier === 'test-driver' || identifier === account.phone_e164 || subjectId === account.subject_id)) return account;
      return undefined;
    },
    async confirmed(_id: string, channel: RecoveryChannel) { return verified.has(channel); },
    async create(challenge: Omit<Challenge, 'proof'>) {
      challenges.set(challenge.id, { ...challenge, proof: '' });
    },
    async setProof(id: string, proof: string) { challenges.get(id)!.proof = proof; },
    async claim(id: string, role: string, sessionId: string | null) {
      const challenge = challenges.get(id);
      return role === account.subject_type && challenge?.session_id === sessionId &&
        !challenge.proof.startsWith('reset:') ? challenge : undefined;
    },
    async authorizeReset(id: string, proof: string) {
      const challenge = challenges.get(id);
      if (!challenge || !verified.has(challenge.channel)) return false;
      challenge.proof = proof;
      return true;
    },
    async claimReset(id: string, role: string, proof: string) {
      const challenge = challenges.get(id);
      return role === account.subject_type && challenge?.proof === proof ? challenge : undefined;
    },
    async release() {},
    async finish(input: Parameters<PostgresPasswordRecoveryStore['finish']>[0]) {
      if (!input.isCurrent(account, input.challenge)) return false;
      if (input.password === null) {
        verified.add(input.challenge.channel);
      } else {
        account.password = input.password;
      }
      challenges.delete(input.challenge.id);
      return true;
    },
  };
  const dependencies = {
    store: store as unknown as PostgresPasswordRecoveryStore,
    identities: { async findIdentityBySubject() {
      return { subjectId: account.subject_id, status: 'active' };
    } } as unknown as AuthIdentityRepository,
    sessions: { async findByTokenHash() { return session; } } as unknown as AuthSessionRepository,
    deliveries: {
      email: { dailyLimit: 80, async send(input: { destination: string; code: string }) {
        deliveries.push({ destination: input.destination, code: input.code, channel: 'email' });
        return null;
      } },
      whatsapp: {
        dailyLimit: 50,
        async send(input: { destination: string }) {
          deliveries.push({ destination: input.destination, code: '271828', channel: 'whatsapp' });
          return 'provider-reference';
        },
        async verify(reference: string, code: string) {
          return reference === 'provider-reference' && code === '271828';
        },
      },
    },
    secret: 'only-for-local-fake-tests-000000000000',
    clientIp: '192.0.2.1',
    clientInstanceId: undefined,
  };
  async function call(action: string, body: object, authenticated = false, role = 'driver') {
    const results: { status: number; body: Record<string, string | number> }[] = [];
    const request = { method: action === 'contact-status' ? 'GET' : 'POST', headers: authenticated ? { authorization: 'Bearer ' + token } : {} };
    await handlePasswordRecoveryRoute({
      request: request as IncomingMessage,
      response: { setHeader() {} } as unknown as ServerResponse,
      pathname: `/v1/auth/${role}/recovery/${action}`,
      readJson: async () => body,
      json: (_, status, body) => { results.push({ status, body: body as Record<string, string | number> }); },
      dependencies,
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    const result = results[0];
    assert.ok(result);
    return result;
  }

  const noContact = await call('request', { identifier: 'test-driver', channel: 'email' });
  const noAccount = await call('request', { identifier: 'nobody', channel: 'email' });
  assert.equal(noContact.status, 202);
  assert.equal(noAccount.status, 202);
  assert.deepEqual(Object.keys(noContact.body), Object.keys(noAccount.body));
  assert.equal(deliveries.length, 0);

  await assert.rejects(call('contact-status', {}), { code: 'AUTH_REQUIRED' });
  await assert.rejects(call('confirm-request', { identifier: 'test-driver', channel: 'email' }), { code: 'AUTH_REQUIRED' });
  assert.equal((await call('contact-status', {}, true)).status, 200);

  const proof = await call('confirm-request', { channel: 'whatsapp', password }, true);
  assert.equal(proof.status, 202);
  assert.deepEqual(deliveries.slice(), [{ destination: account.phone_e164, channel: 'whatsapp', code: '271828' }]);
  assert.equal((await call('confirm-complete', { ...proof.body, code: '271828' }, true)).status, 200);
  assert.equal((await call('request', { identifier: 'test-driver', channel: 'email' })).status, 202);
  assert.equal(deliveries.length, 1);

  const reset = await call('request', { identifier: 'test-driver', channel: 'whatsapp' });
  assert.equal(deliveries.length, 2);
  const payload = { ...reset.body, code: '271828', password: 'new-secure-pass123' };
  assert.equal((await call('complete', payload, false, 'passenger')).status, 422);
  assert.equal((await call('complete', { ...payload, code: '000000' })).status, 422);
  assert.equal((await call('complete', payload)).status, 200);
  assert.equal((await call('complete', payload)).status, 422);
  assert.ok(limits.some(rules => rules.some(rule => rule.limit === 50 && rule.windowMs === 86_400_000)
    && rules.some(rule => rule.limit === 4 && rule.windowMs === 900_000)));
  assert.ok(limits.some(rules => rules.some(rule => rule.limit === 3 && rule.windowMs === 900_000)
    && rules.some(rule => rule.limit === 1 && rule.windowMs === 60_000)));
  const confirmEmail = await call('confirm-request', {
    channel: 'email', password: payload.password,
  }, true);
  assert.equal(confirmEmail.status, 202);
  const confirmationEmail = deliveries[2]!;
  assert.equal(confirmationEmail.channel, 'email');
  assert.equal(confirmationEmail.destination, account.email_normalized);
  assert.equal((await call('confirm-complete', { ...confirmEmail.body, code: confirmationEmail.code }, true)).status, 200);

  const emailReset = await call('request', { identifier: '(88) 99999-0000', channel: 'email' });
  assert.equal(deliveries.length, 4);
  const credential = { ...emailReset.body, password: 'another-secure-pass123' };
  assert.equal((await call('reset', { ...credential, resetToken: 'a'.repeat(43) })).status, 422);
  assert.equal((await call('verify', { ...emailReset.body, code: 'bad' })).status, 422);
  const otp = { ...emailReset.body, code: deliveries[3]!.code };
  const verifiedOtp = await call('verify', otp);
  assert.equal(verifiedOtp.status, 200);
  assert.equal((await call('verify', otp)).status, 422);
  assert.equal((await call('complete', { ...credential, code: otp.code })).status, 422);
  const update = { ...credential, resetToken: verifiedOtp.body['resetToken'] };
  assert.equal((await call('reset', update, false, 'passenger')).status, 422);
  assert.equal((await call('reset', update)).status, 200);
  assert.equal((await call('reset', update)).status, 422);
  assert.ok(limits.some(rules => rules.some(rule => rule.limit === 80 && rule.windowMs === 86_400_000)));

  rejectRateLimit = true;
  const blocked = await call('request', { identifier: 'test-driver', channel: 'whatsapp' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body['retryAfterSeconds'], 12);
  assert.equal(deliveries.length, 4);
});

test('new recovery providers use separate configuration and documented request bodies', async t => {
  const requests: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    if (url.endsWith('/send')) return Response.json({ ok: true, status: 'pending', otpId: 'wa-reference' });
    if (url.endsWith('/verify')) return Response.json({ ok: true, verified: true });
    return Response.json({ id: 'email-reference' });
  });
  assert.deepEqual(recoveryDeliveryFromEnv({ ENTRAR_API_SECRET: 'old-secret' }), {});
  const provider = recoveryDeliveryFromEnv({
    RESEND_API_KEY: 'test-key',
    PASSWORD_RECOVERY_EMAIL_FROM: 'test@example.test',
    PASSWORD_RECOVERY_ENTRAR_API_SECRET: 'new-test-key',
  });
  const email = { id: 'test-email', destination: 'passenger@example.test', code: '004027' };
  assert.equal(await provider.email!.send(email), null);
  assert.equal(await provider.whatsapp!.send({ ...email, destination: '+5588999990000' }), 'wa-reference');
  assert.equal(await provider.whatsapp!.verify!('wa-reference', '004027'), true);
  assert.deepEqual(requests.map(request => request.url), [
    'https://api.resend.com/emails',
    'https://cpf.entrar.api.br/api/otp/send',
    'https://cpf.entrar.api.br/api/otp/verify',
  ]);
  const emailRequest = requests[0]!.init;
  assert.match(JSON.parse(String(emailRequest.body)).text, /004027/);
  assert.equal(new Headers(emailRequest.headers).get('idempotency-key'), 'test-email');
  assert.deepEqual(JSON.parse(String(requests[1]!.init.body)), { telefone: '+5588999990000' });
  assert.deepEqual(JSON.parse(String(requests[2]!.init.body)), { otpId: 'wa-reference', codigo: '004027' });
});

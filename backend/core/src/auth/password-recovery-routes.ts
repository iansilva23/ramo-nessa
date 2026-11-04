import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthIdentityRepository } from './auth-identity-repository.js';
import { authenticateBearer } from './auth-service.js';
import type { AuthSessionRepository, AuthSubjectType } from './auth-session-repository.js';
import {
  hashPassengerPassword,
  PassengerPasswordAuthError,
  validatePassengerPassword,
  verifyPassengerPassword,
} from './passenger-password-auth-service.js';
import { recoveryDestination, type PostgresPasswordRecoveryStore } from './password-recovery-store.js';
import { RecoveryProviderError, type RecoveryChannel, type RecoveryDelivery } from './recovery-delivery.js';

type Dependencies = {
  store: PostgresPasswordRecoveryStore | null;
  identities: AuthIdentityRepository;
  sessions: AuthSessionRepository;
  deliveries: Partial<Record<RecoveryChannel, RecoveryDelivery>>;
  secret: string;
  clientIp: string | undefined;
  clientInstanceId: string | undefined;
};

const channels = ['email', 'whatsapp'] as const;
const invalidCode = 'Código inválido ou expirado. Confira o código ou solicite outro.';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function digest(secret: string, ...parts: string[]) {
  return createHmac('sha256', secret).update(JSON.stringify(parts)).digest('hex');
}

export async function handlePasswordRecoveryRoute(input: {
  request: IncomingMessage;
  response: ServerResponse;
  pathname: string;
  readJson: (request: IncomingMessage) => Promise<unknown>;
  json: (response: ServerResponse, status: number, body: unknown) => void;
  dependencies: Dependencies;
}): Promise<boolean> {
  const { request, response, dependencies: d } = input;
  const match = /^\/v1\/auth\/(driver|passenger)\/recovery\/(channels|request|complete|confirm-request|confirm-complete)$/.exec(input.pathname);
  if (!match) return false;

  const role = match[1] as AuthSubjectType;
  const action = match[2]!;
  const confirmation = action.startsWith('confirm-');
  const start = action.endsWith('request');
  const reply = (status: number, body: unknown) => {
    input.json(response, status, body);
    return true;
  };
  const invalid = () => reply(422, { error: 'RECOVERY_INVALID', message: invalidCode });
  const limited = (retryAfterMs: number) => {
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    response.setHeader('retry-after', String(retryAfterSeconds));
    return reply(429, {
      error: 'RECOVERY_RATE_LIMITED', retryAfterSeconds,
      message: 'Aguarde antes de tentar novamente.',
    });
  };

  response.setHeader('cache-control', 'no-store');
  if (request.method !== (action === 'channels' ? 'GET' : 'POST')) {
    return reply(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  const store = d.store;
  if (action === 'channels') {
    return reply(200, { channels: store == null ? [] : channels.filter(channel => d.deliveries[channel]) });
  }
  if (store == null) return reply(503, { error: 'RECOVERY_UNAVAILABLE', message: 'Recuperação indisponível no momento.' });

  const takeLimit = (scope: string, keys: [string, number, number][]) =>
    store.takeLimit(keys.map(([key, limit, windowMs]) => ({
      key: digest(d.secret, 'rate', scope, key), limit, windowMs,
    })));

  const session = confirmation ? await authenticateBearer({
    repository: d.sessions, identities: d.identities, headers: request.headers,
    requiredType: role, allowDriverRegistration: true,
  }) : null;
  const value = await input.readJson(request);
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const field = (name: string) => typeof body[name] === 'string' ? body[name] as string : '';

  if (start) {
    const channel = field('channel') as RecoveryChannel;
    if (!channels.includes(channel)) return invalid();
    const provider = d.deliveries[channel];
    if (!provider) return reply(503, { error: 'RECOVERY_CHANNEL_UNAVAILABLE', message: 'Este canal está indisponível. Tente outro.' });
    const identifier = field('identifier').trim().toLowerCase();
    if (!session && (identifier.length < 3 || identifier.length > 254)) {
      return reply(422, { error: 'RECOVERY_IDENTIFIER_INVALID', message: 'Informe o acesso usado na conta.' });
    }
    const requestKey = `account:${role}:${channel}:${session?.subjectId ?? identifier}`;
    const requestLimit = await takeLimit('request', [
      [`${requestKey}:cooldown`, 1, 60_000],
      [requestKey, 3, 15 * 60_000],
      ...(d.clientIp ? [[`ip:${d.clientIp}`, 20, 15 * 60_000] as [string, number, number]] : []),
      ...(d.clientInstanceId ? [[`client:${d.clientInstanceId}`, 12, 15 * 60_000] as [string, number, number]] : []),
    ]);
    if (!requestLimit.allowed) return limited(requestLimit.retryAfterMs);

    const id = randomUUID();
    const account = await store.account(role, identifier, session?.subjectId);
    const destination = account && recoveryDestination(account, channel);
    const password = account?.password;
    if (session && (!password || !await verifyPassengerPassword(field('password'), password))) {
      return reply(422, { error: 'RECOVERY_PASSWORD_INVALID', message: 'Confira sua senha atual.' });
    }
    if (session && !destination) {
      return reply(422, { error: 'RECOVERY_CONTACT_MISSING', message: 'Este contato não está cadastrado na sua conta.' });
    }
    if (account && destination && password) {
      const destinationHash = digest(d.secret, 'contact', channel, destination);
      if (session || await store.confirmed(account.id, channel, destinationHash)) {
        // Provider work has no effect on the public HTTP response or its timing.
        void (async () => {
          const allowed = await takeLimit('delivery', [
            [`destination:${channel}:${destination}`, 3, 15 * 60_000],
            [`destination-cooldown:${channel}:${destination}`, 1, 60_000],
            [`identity:${account.id}`, 4, 15 * 60_000],
            [`channel-burst:${channel}`, Math.min(20, provider.dailyLimit), 15 * 60_000],
            [`channel-daily:${channel}`, provider.dailyLimit, 24 * 60 * 60_000],
          ]);
          if (!allowed.allowed) return;
          const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
          await store.create({
            id, identity_id: account.id, channel, session_id: session?.id ?? null,
            destination_hash: destinationHash,
            credential_hash: digest(d.secret, 'credential', account.id, password),
          });
          const reference = await provider.send({ id, destination, code });
          await store.setProof(id, reference ?? digest(d.secret, 'code', id, code));
        })().catch(() => {
          // Upstream bodies can contain codes and personal data.
          console.warn('Password recovery delivery could not be completed.');
        });
      }
    }
    return reply(202, { challengeId: id });
  }

  const id = field('challengeId');
  const code = field('code').trim();
  const password = field('password');
  if (!uuid.test(id) || !/^\d{6}$/.test(code)) return invalid();
  if (!confirmation) {
    try {
      validatePassengerPassword(password);
    } catch (error) {
      if (!(error instanceof PassengerPasswordAuthError)) throw error;
      return reply(422, { error: error.code, message: error.message });
    }
  }
  const verificationLimit = await takeLimit('verification', [
    ...(d.clientIp ? [[`ip:${d.clientIp}`, 40, 15 * 60_000] as [string, number, number]] : []),
    [`challenge:${id}`, 8, 5 * 60_000],
  ]);
  if (!verificationLimit.allowed) return limited(verificationLimit.retryAfterMs);

  const challenge = await store.claim(id, role, session?.id ?? null);
  if (!challenge) return invalid();
  try {
    const provider = d.deliveries[challenge.channel];
    if (!provider) return invalid();
    const valid = provider.verify
      ? await provider.verify(challenge.proof, code)
      : timingSafeEqual(Buffer.from(challenge.proof), Buffer.from(digest(d.secret, 'code', id, code)));
    if (!valid) return invalid();
    const updated = await store.finish({
      role, challenge, password: confirmation ? null : await hashPassengerPassword(password),
      isCurrent: (account, expected) => {
        const destination = recoveryDestination(account, expected.channel);
        return Boolean(destination && account.password &&
          digest(d.secret, 'contact', expected.channel, destination) === expected.destination_hash &&
          digest(d.secret, 'credential', account.id, account.password) === expected.credential_hash);
      },
    });
    return updated ? reply(200, { ok: true }) : invalid();
  } catch (error) {
    if (error instanceof RecoveryProviderError) {
      return reply(503, { error: 'RECOVERY_CHANNEL_UNAVAILABLE', message: 'Este canal está indisponível. Tente outro.' });
    }
    throw error;
  } finally {
    await store.release(id);
  }
}

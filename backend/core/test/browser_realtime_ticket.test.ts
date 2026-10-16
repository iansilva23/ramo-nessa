import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomingMessage } from 'node:http';
import { issueAuthSession } from '../src/auth/auth-service.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';
import { InMemoryAuthOtpRepository } from '../src/auth/repositories/in-memory-auth-otp-repository.js';
import { BrowserRealtimeTicketStore, browserRealtimeOrigin, validateBrowserRealtimeSession } from '../src/realtime/browser-realtime-ticket.js';

const origin = 'https://app.example.com';
const now = Date.now();
async function fixture(role: 'driver' | 'passenger' = 'passenger') {
  const sessions = new InMemoryAuthSessionRepository();
  const identities = new InMemoryAuthOtpRepository();
  const issued = await issueAuthSession({ repository: sessions, subjectId: role + '-ticket',
    subjectType: role, now: new Date(now), ttlMs: 60_000 });
  return { sessions, identities, issued, store: new BrowserRealtimeTicketStore() };
}

test('ticket expires at 15s, is scoped to origin/role/ride and can be consumed only once', async () => {
  const f = await fixture();
  const issue = () => f.store.issue(f.issued.session, origin, 'ride-one', now);
  let ticket = issue().ticket;
  const grant = f.store.consume(ticket, origin, 'passenger', 'ride-one', now + 1);
  assert.equal(grant.session.tokenHash, f.issued.session.tokenHash);
  assert.notEqual(ticket, f.issued.token);
  assert.throws(() => f.store.consume(ticket, origin, 'passenger', 'ride-one', now + 2));
  for (const [wrongOrigin, role, ride] of [
    ['https://evil.example.com', 'passenger', 'ride-one'],
    [origin, 'driver', 'ride-one'], [origin, 'passenger', 'ride-two'],
  ]) {
    ticket = issue().ticket;
    assert.throws(() => f.store.consume(ticket, wrongOrigin!, role!, ride!, now));
    assert.throws(() => f.store.consume(ticket, origin, 'passenger', 'ride-one', now));
  }
  ticket = issue().ticket;
  assert.throws(() => f.store.consume(ticket, origin, 'passenger', 'ride-one', now + 15_000));
});

test('pending tickets are bounded per session, pruned after expiry, and never outlive session', async () => {
  const f = await fixture();
  for (let i = 0; i < 4; i++) f.store.issue(f.issued.session, origin, 'ride-one', now);
  assert.throws(() => f.store.issue(f.issued.session, origin, 'ride-one', now));
  assert.doesNotThrow(() => f.store.issue(f.issued.session, origin, 'ride-one', now + 15_000));
  const short = { ...f.issued.session, expiresAt: new Date(now + 100).toISOString() };
  const ticket = new BrowserRealtimeTicketStore().issue(short, origin, 'ride-one', now);
  assert.equal(Date.parse(ticket.expiresAt), now + 100);
});

test('ticket revalidates logout, expiry and suspended identity at connection time', async () => {
  for (const scenario of ['logout', 'expiry', 'suspended'] as const) {
    const f = await fixture();
    const issued = f.store.issue(f.issued.session, origin, 'ride-one', now);
    const grant = f.store.consume(issued.ticket, origin, 'passenger', 'ride-one', now);
    await validateBrowserRealtimeSession({ ...f, grant, now });
    if (scenario === 'logout') await f.sessions.revoke(f.issued.session.id, new Date(now).toISOString());
    if (scenario === 'suspended') await f.identities.createIdentity({
      id: 'identity-suspended', subjectId: f.issued.session.subjectId, subjectType: 'passenger',
      phoneE164: '+5588999999999', status: 'suspended', createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    await assert.rejects(validateBrowserRealtimeSession({ ...f, grant,
      now: scenario === 'expiry' ? now + 60_000 : now }));
  }
});

test('browser origin rejects foreign hosts, credentials, paths, null and missing origins', () => {
  const request = (value?: string) => ({ headers: { host: 'app.example.com',
    ...(value == null ? {} : { origin: value }) } }) as IncomingMessage;
  assert.equal(browserRealtimeOrigin(request(origin)), origin);
  for (const bad of ['https://evil.example.com', 'https://app.example.com/path',
    'https://user@app.example.com', 'null', undefined]) {
    assert.throws(() => browserRealtimeOrigin(request(bad)));
  }
});

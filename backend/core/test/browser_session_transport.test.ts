import assert from 'node:assert/strict';
import test from 'node:test';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { browserSessionHandle, prepareBrowserSessionRequest, browserAuthResponse,
  clearBrowserSessionCookie, BrowserSessionTransportError } from '../src/auth/browser-session-transport.js';
import { issueAuthSession, authenticateBearer } from '../src/auth/auth-service.js';
import { InMemoryAuthSessionRepository } from '../src/auth/repositories/in-memory-auth-session-repository.js';

const secret = 'fixture-private-credential-abcdefghijklmnopqrstuvwxyz';
function request(method = 'POST', headers: Record<string, string> = {}) {
  const req = new IncomingMessage(new Socket()); req.method = method;
  req.headers = { host: 'api.example.test', origin: 'https://api.example.test', ...headers };
  return req;
}
function login(role: 'passenger' | 'driver', token = secret) {
  const req = request('POST', { 'x-ramo-web-role': role });
  prepareBrowserSessionRequest(req);
  const res = new ServerResponse(req);
  const body = browserAuthResponse(req, res, { accessToken: token, subjectType: role, subjectId: 'fixture-' + role,
    expiresAt: '2027-01-01T00:00:00.000Z', tokenType: 'Bearer' as const });
  return { req, res, body, cookie: String(res.getHeader('set-cookie')).split(';')[0]! };
}

test('Web login emits hardened host-only cookie and public response only', () => {
  const f = login('passenger');
  assert.equal(f.body.accessToken, browserSessionHandle('passenger', secret));
  assert.ok(!JSON.stringify(f.body).includes(secret));
  const header = String(f.res.getHeader('set-cookie'));
  for (const attribute of ['__Host-ramo_passenger=', 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Expires=']) assert.ok(header.includes(attribute));
  assert.ok(!header.includes('Domain='));
});
test('native login response and Bearer request are unchanged', () => {
  const req = request('GET', { authorization: 'Bearer ' + secret });
  assert.equal(prepareBrowserSessionRequest(req), null);
  const res = new ServerResponse(req);
  const session = { accessToken: secret, subjectType: 'passenger' as const, expiresAt: '2027-01-01T00:00:00Z' };
  assert.equal(browserAuthResponse(req, res, session), session);
  assert.equal(res.getHeader('set-cookie'), undefined);
});
test('only corresponding role cookie is used and logout clears only that cookie', () => {
  const passenger = login('passenger'), driver = login('driver', secret + '-driver');
  const req = request('DELETE', { authorization: 'Bearer ' + driver.body.accessToken,
    cookie: passenger.cookie + '; ' + driver.cookie });
  assert.equal(prepareBrowserSessionRequest(req), 'driver');
  assert.equal(req.headers.authorization, 'Bearer ' + secret + '-driver');
  const res = new ServerResponse(req); clearBrowserSessionCookie(req, res);
  assert.ok(String(res.getHeader('set-cookie')).startsWith('__Host-ramo_driver='));
  assert.ok(!String(res.getHeader('set-cookie')).includes('passenger'));
});
test('cookie alone, public handle alone and stale handle never authorize a different session', () => {
  const f = login('passenger');
  assert.equal(prepareBrowserSessionRequest(request('GET', { cookie: f.cookie })), null);
  for (const cookie of ['', '__Host-ramo_passenger=' + secret + '-new', f.cookie + '; ' + f.cookie]) {
    const req = request('DELETE', { authorization: 'Bearer ' + f.body.accessToken, cookie });
    assert.throws(() => prepareBrowserSessionRequest(req), BrowserSessionTransportError);
    const res = new ServerResponse(req); clearBrowserSessionCookie(req, res);
    assert.equal(res.getHeader('set-cookie'), undefined);
  }
});
test('cross-origin, HTTP origin, null origin and missing unsafe origin are rejected', () => {
  for (const origin of ['https://evil.example', 'http://api.example.test', 'null', '']) {
    const req = request('POST', { 'x-ramo-web-role': 'passenger', origin });
    assert.throws(() => prepareBrowserSessionRequest(req), (error: unknown) =>
      error instanceof BrowserSessionTransportError && error.status === 403);
  }
  assert.throws(() => prepareBrowserSessionRequest(request('POST', {
    'x-ramo-web-role': 'passenger', 'sec-fetch-site': 'same-site',
  })), BrowserSessionTransportError);
});
test('safe browser reads accept same-origin referrer or Fetch Metadata, but not foreign site', () => {
  const f = login('passenger');
  for (const headers of [{ referer: 'https://api.example.test/passageiro/' }, { 'sec-fetch-site': 'same-origin' }]) {
    const req = request('GET', { authorization: 'Bearer ' + f.body.accessToken, cookie: f.cookie, ...headers });
    delete req.headers.origin;
    assert.equal(prepareBrowserSessionRequest(req), 'passenger');
  }
  const denied = request('GET', { authorization: 'Bearer ' + f.body.accessToken, cookie: f.cookie, 'sec-fetch-site': 'cross-site' });
  assert.throws(() => prepareBrowserSessionRequest(denied), BrowserSessionTransportError);
});
test('role mismatch and credential duplicates fail without exposing supplied credentials', () => {
  const f = login('passenger');
  const req = request('POST', { authorization: 'Bearer ' + f.body.accessToken, cookie: f.cookie, 'x-ramo-web-role': 'driver' });
  assert.throws(() => prepareBrowserSessionRequest(req), error =>
    error instanceof BrowserSessionTransportError && !String(error).includes(secret));
  const mismatched = request('POST', { 'x-ramo-web-role': 'passenger' }); prepareBrowserSessionRequest(mismatched);
  assert.throws(() => browserAuthResponse(mismatched, new ServerResponse(mismatched), {
    accessToken: secret, subjectType: 'driver', expiresAt: '2027-01-01T00:00:00Z',
  }), BrowserSessionTransportError);
});
test('cookie transport continues to enforce Core expiry, revocation and account role', async () => {
  const sessions = new InMemoryAuthSessionRepository();
  const now = new Date('2026-10-13T22:00:00Z');
  const issued = await issueAuthSession({ repository: sessions, subjectId: 'passenger-cookie', subjectType: 'passenger', now, ttlMs: 60_000 });
  const f = login('passenger', issued.token);
  const req = request('GET', { authorization: 'Bearer ' + f.body.accessToken, cookie: f.cookie });
  prepareBrowserSessionRequest(req);
  const input = { repository: sessions, headers: req.headers, requiredType: 'passenger' as const };
  const valid = await authenticateBearer({ ...input, now: new Date(now.getTime() + 30_000) });
  assert.equal(valid.id, issued.session.id); assert.equal(valid.expiresAt, issued.session.expiresAt);
  await assert.rejects(() => authenticateBearer({ ...input, requiredType: 'driver', now: new Date(now.getTime() + 30_000) }));
  await assert.rejects(() => authenticateBearer({ ...input, now: new Date(now.getTime() + 60_000) }));
  await sessions.revoke(issued.session.id, now.toISOString());
  await assert.rejects(() => authenticateBearer({ ...input, now: new Date(now.getTime() + 30_000) }));
});

test('explicit same-origin bootstrap recovers public handle without rewriting cookie', () => {
  const f = login('passenger');
  const req = request('GET', { 'x-ramo-web-role': 'passenger', cookie: f.cookie });
  assert.equal(prepareBrowserSessionRequest(req, { cookieBootstrap: true }), 'passenger');
  const res = new ServerResponse(req);
  const body = browserAuthResponse(req, res, { accessToken: secret, subjectType: 'passenger', expiresAt: '2027-01-01T00:00:00Z' }, { setCookie: false });
  assert.equal(body.accessToken, f.body.accessToken); assert.equal(res.getHeader('set-cookie'), undefined);
  const write = request('POST', { 'x-ramo-web-role': 'passenger', cookie: f.cookie });
  assert.equal(prepareBrowserSessionRequest(write, { cookieBootstrap: true }), null);
  assert.equal(write.headers.authorization, undefined);
});

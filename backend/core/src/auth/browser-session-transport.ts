import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthSubjectType } from './auth-session-repository.js';

type BrowserRole = 'passenger' | 'driver';
const contexts = new WeakMap<IncomingMessage, { role: BrowserRole; authenticated: boolean }>();
const handlePattern = /^ramo_web_(passenger|driver)_v1_([a-f0-9]{32})$/;
const tokenPattern = /^[A-Za-z0-9_-]{20,4096}$/;

export class BrowserSessionTransportError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 401) {
    super('Sessão Web indisponível. Entre novamente.');
    this.name = 'BrowserSessionTransportError'; this.code = code; this.status = status;
  }
}
export function browserSessionHandle(role: BrowserRole, token: string): string {
  return 'ramo_web_' + role + '_v1_' + createHash('sha256').update(token).digest('hex').slice(0, 32);
}
function cookieName(role: BrowserRole): string { return '__Host-ramo_' + role; }
function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) throw new BrowserSessionTransportError('WEB_SESSION_HEADERS_INVALID', 403);
  return value;
}
function requireSameOrigin(request: IncomingMessage): void {
  try {
    const host = header(request, 'host');
    const expected = new URL('https://' + host);
    if (!host || expected.host !== host || expected.username || expected.password) throw new Error();
    const site = header(request, 'sec-fetch-site');
    if (site != null && site !== 'same-origin') throw new Error();
    const origin = header(request, 'origin');
    if (origin != null) {
      if (origin !== expected.origin) throw new Error();
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method ?? '')) throw new Error();
    const referrer = header(request, 'referer');
    if (referrer != null && new URL(referrer).origin === expected.origin) return;
    if (site === 'same-origin') return;
    throw new Error();
  } catch { throw new BrowserSessionTransportError('WEB_SESSION_ORIGIN_DENIED', 403); }
}

// Cookies alone never authorize an API call. The non-secret handle explicitly
// selects a role and binds the request to the current cookie session.
export function prepareBrowserSessionRequest(request: IncomingMessage, options: { cookieBootstrap?: boolean } = {}): BrowserRole | null {
  const authorization = header(request, 'authorization');
  const match = authorization?.match(/^Bearer (ramo_web_(passenger|driver)_v1_[a-f0-9]{32})$/);
  const declared = header(request, 'x-ramo-web-role');
  if (!match && declared == null) return null; // Existing native Bearer transport.
  if (declared != null && declared !== 'passenger' && declared !== 'driver') {
    throw new BrowserSessionTransportError('WEB_SESSION_ROLE_INVALID', 403);
  }
  const role = (match?.[2] ?? declared) as BrowserRole;
  if ((declared != null && declared !== role) || (authorization && !match)) {
    throw new BrowserSessionTransportError('WEB_SESSION_ROLE_INVALID', 403);
  }
  requireSameOrigin(request);
  const bootstrap = options.cookieBootstrap === true && request.method === 'GET';
  if (!match && !bootstrap) { contexts.set(request, { role, authenticated: false }); return null; }
  const raw = header(request, 'cookie') ?? '';
  if (raw.length > 16384) throw new BrowserSessionTransportError('WEB_SESSION_COOKIE_INVALID');
  const values = raw.split(';').map(part => part.trim()).filter(part => part.startsWith(cookieName(role) + '='));
  if (values.length !== 1) throw new BrowserSessionTransportError('WEB_SESSION_COOKIE_REQUIRED');
  const token = values[0]!.slice(cookieName(role).length + 1);
  if (!tokenPattern.test(token)) throw new BrowserSessionTransportError('WEB_SESSION_COOKIE_INVALID');
  const expected = browserSessionHandle(role, token);
  if (match && !timingSafeEqual(Buffer.from(expected), Buffer.from(match[1]!))) {
    // A stale tab must not clear or revoke the newer session's cookie.
    throw new BrowserSessionTransportError('WEB_SESSION_STALE');
  }
  contexts.set(request, { role, authenticated: true });
  request.headers.authorization = 'Bearer ' + token;
  return role;
}

export function browserAuthResponse<T extends { accessToken: string; subjectType: AuthSubjectType; expiresAt: string }>(
  request: IncomingMessage, response: ServerResponse, session: T, options: { setCookie?: boolean } = {},
): T {
  const context = contexts.get(request);
  if (!context) return session; // Native response is unchanged.
  if (context.role !== session.subjectType || !tokenPattern.test(session.accessToken) ||
      !Number.isFinite(Date.parse(session.expiresAt))) {
    throw new BrowserSessionTransportError('WEB_SESSION_ROLE_INVALID', 403);
  }
  if (options.setCookie !== false) {
    response.setHeader('set-cookie', cookieName(context.role) + '=' + session.accessToken +
      '; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=' + new Date(session.expiresAt).toUTCString());
  }
  return { ...session, accessToken: browserSessionHandle(context.role, session.accessToken) };
}

export function clearBrowserSessionCookie(request: IncomingMessage, response: ServerResponse): void {
  const context = contexts.get(request);
  if (!context?.authenticated) return;
  response.setHeader('set-cookie', cookieName(context.role) +
    '=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
}

export function isBrowserSessionHandle(value: string): boolean { return handlePattern.test(value); }

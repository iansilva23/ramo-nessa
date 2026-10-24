import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AuthSessionRecord, AuthSessionRepository } from '../auth/auth-session-repository.js';
import type { AuthOtpRepository } from '../auth/auth-otp-repository.js';
import { AuthenticationError, hashBearerToken } from '../auth/auth-service.js';

export const BROWSER_REALTIME_PROTOCOL = 'ramo.realtime.v1';
const TICKET_TTL_MS = 15_000;

export interface BrowserRealtimeGrant {
  session: AuthSessionRecord;
  origin: string;
  rideId: string | null;
  expiresAt: number;
}

// Host is supplied by the browser and preserved by the scoped Caddy virtual host.
// Never trust arbitrary forwarded headers to choose a third-party Origin.
export function browserRealtimeOrigin(request: IncomingMessage): string {
  const raw = request.headers.origin;
  try {
    const origin = new URL(raw ?? '');
    if (raw !== origin.origin || origin.host !== request.headers.host ||
        (origin.protocol !== 'https:' &&
          !(process.env.NODE_ENV !== 'production' && origin.protocol === 'http:'))) {
      throw new Error('origin');
    }
    return origin.origin;
  } catch {
    throw new AuthenticationError('AUTH_INVALID', 'Origem Web não autorizada.');
  }
}

// One Core instance today. Tickets disappear on restart; clients obtain a new one.
// Store only token hashes; cap pending grants globally and per login session.
export class BrowserRealtimeTicketStore {
  private readonly grants = new Map<string, BrowserRealtimeGrant>();

  issue(session: AuthSessionRecord, origin: string, rideId: string | null, now = Date.now()) {
    for (const [key, grant] of this.grants) {
      if (grant.expiresAt <= now) this.grants.delete(key);
    }
    if (this.grants.size >= 5000 ||
        [...this.grants.values()].filter(g => g.session.id === session.id).length >= 4) {
      throw new AuthenticationError('AUTH_INVALID', 'Limite de conexões pendentes.');
    }
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = Math.min(now + TICKET_TTL_MS, Date.parse(session.expiresAt));
    this.grants.set(hashBearerToken(ticket), {
      session: { ...session }, origin, rideId, expiresAt,
    });
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  consume(ticket: string, origin: string, role: string, rideId: string | null,
          now = Date.now()): BrowserRealtimeGrant {
    const key = hashBearerToken(ticket);
    const grant = this.grants.get(key);
    // Delete before any await: concurrent upgrades cannot replay the same ticket.
    this.grants.delete(key);
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket) || grant == null ||
        grant.expiresAt <= now || grant.origin !== origin ||
        grant.session.subjectType !== role || grant.rideId !== rideId) {
      throw new AuthenticationError('AUTH_INVALID', 'Ticket Web inválido.');
    }
    return grant;
  }
}

export async function validateBrowserRealtimeSession(input: {
  grant: BrowserRealtimeGrant;
  sessions: AuthSessionRepository;
  identities: AuthOtpRepository;
  now?: number;
}): Promise<void> {
  const session = await input.sessions.findByTokenHash(input.grant.session.tokenHash);
  if (session == null || session.id !== input.grant.session.id || session.revokedAt != null ||
      Date.parse(session.expiresAt) <= (input.now ?? Date.now()) ||
      session.subjectType !== input.grant.session.subjectType ||
      session.subjectId !== input.grant.session.subjectId) {
    throw new AuthenticationError('AUTH_INVALID', 'Sessão Web encerrada.');
  }
  const identity = await input.identities.findIdentityBySubject(session.subjectType, session.subjectId);
  if (identity?.status === 'suspended' ||
      (identity == null && process.env.NODE_ENV === 'production') ||
      (session.subjectType === 'driver' && identity?.driverRegistrationOnly === true)) {
    throw new AuthenticationError('AUTH_IDENTITY_DISABLED', 'Conta Web indisponível.');
  }
}

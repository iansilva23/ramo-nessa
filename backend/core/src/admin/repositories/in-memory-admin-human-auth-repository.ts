import type {
  AdminHumanAuthRepository,
  AdminHumanSessionRecord,
  AdminHumanStatus,
  AdminHumanUserRecord,
  AdminLoginRateLimitResult,
} from '../admin-human-auth-repository.js';

interface RateLimitRecord {
  windowStartedAt: string;
  attemptCount: number;
}

export class InMemoryAdminHumanAuthRepository
  implements AdminHumanAuthRepository {
  private readonly users = new Map<string, AdminHumanUserRecord>();
  private readonly sessions = new Map<string, AdminHumanSessionRecord>();
  private readonly rateLimits = new Map<string, RateLimitRecord>();

  async createUser(
    user: AdminHumanUserRecord,
  ): Promise<AdminHumanUserRecord> {
    const duplicate = [...this.users.values()].find(
      (candidate) => candidate.emailNormalized === user.emailNormalized,
    );
    if (duplicate != null) {
      throw new Error('E-mail administrativo já cadastrado.');
    }
    this.users.set(user.id, structuredClone(user));
    return structuredClone(user);
  }

  async findUserByEmail(
    emailNormalized: string,
  ): Promise<AdminHumanUserRecord | null> {
    const found = [...this.users.values()].find(
      (candidate) => candidate.emailNormalized === emailNormalized,
    );
    return found == null ? null : structuredClone(found);
  }

  async findUserById(id: string): Promise<AdminHumanUserRecord | null> {
    const found = this.users.get(id);
    return found == null ? null : structuredClone(found);
  }

  async setUserStatus(input: {
    id: string;
    status: AdminHumanStatus;
    updatedAt: string;
  }): Promise<AdminHumanUserRecord | null> {
    const found = this.users.get(input.id);
    if (found == null) return null;
    const updated = {
      ...found,
      status: input.status,
      updatedAt: input.updatedAt,
    };
    this.users.set(input.id, updated);
    return structuredClone(updated);
  }

  async consumeTotpCounter(input: {
    userId: string;
    counter: number;
    updatedAt: string;
  }): Promise<boolean> {
    const found = this.users.get(input.userId);
    if (
      found == null ||
      (found.lastTotpCounter != null &&
        found.lastTotpCounter >= input.counter)
    ) {
      return false;
    }
    this.users.set(input.userId, {
      ...found,
      lastTotpCounter: input.counter,
      updatedAt: input.updatedAt,
    });
    return true;
  }

  async createSession(
    session: AdminHumanSessionRecord,
  ): Promise<AdminHumanSessionRecord> {
    const duplicate = [...this.sessions.values()].find(
      (candidate) => candidate.tokenHash === session.tokenHash,
    );
    if (duplicate != null) throw new Error('Sessão administrativa duplicada.');
    this.sessions.set(session.id, structuredClone(session));
    return structuredClone(session);
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<AdminHumanSessionRecord | null> {
    const found = [...this.sessions.values()].find(
      (candidate) => candidate.tokenHash === tokenHash,
    );
    return found == null ? null : structuredClone(found);
  }

  async touchSession(id: string, usedAt: string): Promise<void> {
    const found = this.sessions.get(id);
    if (found == null) return;
    this.sessions.set(id, { ...found, lastUsedAt: usedAt });
  }

  async revokeSession(id: string, revokedAt: string): Promise<void> {
    const found = this.sessions.get(id);
    if (found == null) return;
    this.sessions.set(id, {
      ...found,
      revokedAt: found.revokedAt ?? revokedAt,
    });
  }

  async revokeSessionsForUser(
    userId: string,
    revokedAt: string,
  ): Promise<number> {
    let revoked = 0;
    for (const [id, session] of this.sessions) {
      if (session.userId === userId && session.revokedAt == null) {
        this.sessions.set(id, { ...session, revokedAt });
        revoked += 1;
      }
    }
    return revoked;
  }

  async consumeRateLimits(input: {
    rules: Array<{ key: string; limit: number; windowMs: number }>;
    now: string;
  }): Promise<AdminLoginRateLimitResult> {
    const nowMs = Date.parse(input.now);
    const staged = new Map<string, RateLimitRecord>();

    for (const rule of input.rules) {
      const existing = this.rateLimits.get(rule.key);
      if (
        existing == null ||
        nowMs - Date.parse(existing.windowStartedAt) >= rule.windowMs
      ) {
        staged.set(rule.key, {
          windowStartedAt: input.now,
          attemptCount: 1,
        });
        continue;
      }

      if (existing.attemptCount >= rule.limit) {
        return {
          allowed: false,
          retryAfterMs: Math.max(
            1,
            rule.windowMs -
              Math.max(0, nowMs - Date.parse(existing.windowStartedAt)),
          ),
        };
      }

      staged.set(rule.key, {
        ...existing,
        attemptCount: existing.attemptCount + 1,
      });
    }

    for (const [key, value] of staged) {
      this.rateLimits.set(key, value);
    }
    return { allowed: true, retryAfterMs: 0 };
  }
}

import type {
  AuthSessionRecord,
  AuthSessionRepository,
} from '../auth-session-repository.js';

export class InMemoryAuthSessionRepository
  implements AuthSessionRepository {
  private readonly sessions = new Map<string, AuthSessionRecord>();

  async create(session: AuthSessionRecord): Promise<AuthSessionRecord> {
    const nowMs = Date.parse(session.createdAt);
    const retentionMs = 30 * 24 * 60 * 60 * 1000;
    for (const [id, candidate] of this.sessions) {
      const reference = candidate.revokedAt ?? candidate.expiresAt;
      if (Date.parse(reference) < nowMs - retentionMs) {
        this.sessions.delete(id);
      }
    }

    const duplicate = [...this.sessions.values()].find(
      (candidate) => candidate.tokenHash === session.tokenHash,
    );
    if (duplicate != null) {
      throw new Error('Token de sessão duplicado.');
    }
    this.sessions.set(session.id, structuredClone(session));
    return structuredClone(session);
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<AuthSessionRecord | null> {
    const found = [...this.sessions.values()].find(
      (candidate) => candidate.tokenHash === tokenHash,
    );
    return found == null ? null : structuredClone(found);
  }

  async revoke(id: string, revokedAt: string): Promise<void> {
    const existing = this.sessions.get(id);
    if (existing == null) return;
    this.sessions.set(id, {
      ...existing,
      revokedAt: existing.revokedAt ?? revokedAt,
    });
  }

  async revokeAllForSubject(
    subjectType: AuthSessionRecord['subjectType'],
    subjectId: string,
    revokedAt: string,
  ): Promise<number> {
    let revoked = 0;
    for (const [id, session] of this.sessions) {
      if (
        session.subjectType === subjectType &&
        session.subjectId === subjectId &&
        session.revokedAt == null
      ) {
        this.sessions.set(id, { ...session, revokedAt });
        revoked += 1;
      }
    }
    return revoked;
  }

  async revokeOthersForSubject(
    subjectType: AuthSessionRecord['subjectType'],
    subjectId: string,
    exceptSessionId: string,
    revokedAt: string,
  ): Promise<number> {
    let revoked = 0;
    for (const [id, session] of this.sessions) {
      if (
        id !== exceptSessionId &&
        session.subjectType === subjectType &&
        session.subjectId === subjectId &&
        session.revokedAt == null
      ) {
        this.sessions.set(id, { ...session, revokedAt });
        revoked += 1;
      }
    }
    return revoked;
  }
}

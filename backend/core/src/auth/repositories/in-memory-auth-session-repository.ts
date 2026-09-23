import type {
  AuthSessionRecord,
  AuthSessionRepository,
} from '../auth-session-repository.js';

export class InMemoryAuthSessionRepository
  implements AuthSessionRepository {
  private readonly sessions = new Map<string, AuthSessionRecord>();

  async create(session: AuthSessionRecord): Promise<AuthSessionRecord> {
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
    this.sessions.set(id, { ...existing, revokedAt });
  }
}

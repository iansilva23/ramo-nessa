export type AuthSubjectType = 'passenger' | 'driver';

export interface AuthSessionRecord {
  id: string;
  subjectId: string;
  subjectType: AuthSubjectType;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

export interface AuthSessionRepository {
  create(session: AuthSessionRecord): Promise<AuthSessionRecord>;
  findByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  revoke(id: string, revokedAt: string): Promise<void>;
}

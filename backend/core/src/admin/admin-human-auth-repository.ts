import type { AdminScope } from './admin-repository.js';

export type AdminHumanStatus = 'active' | 'suspended';

export interface AdminHumanUserRecord {
  id: string;
  name: string;
  emailNormalized: string;
  passwordHash: string;
  totpSecretCiphertext: string;
  scopes: AdminScope[];
  status: AdminHumanStatus;
  lastTotpCounter?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminHumanSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

export interface AdminLoginRateLimitRule {
  key: string;
  limit: number;
  windowMs: number;
}

export interface AdminLoginRateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface AdminHumanAuthRepository {
  createUser(user: AdminHumanUserRecord): Promise<AdminHumanUserRecord>;
  findUserByEmail(emailNormalized: string): Promise<AdminHumanUserRecord | null>;
  findUserById(id: string): Promise<AdminHumanUserRecord | null>;
  setUserStatus(input: {
    id: string;
    status: AdminHumanStatus;
    updatedAt: string;
  }): Promise<AdminHumanUserRecord | null>;
  consumeTotpCounter(input: {
    userId: string;
    counter: number;
    updatedAt: string;
  }): Promise<boolean>;

  createSession(
    session: AdminHumanSessionRecord,
  ): Promise<AdminHumanSessionRecord>;
  findSessionByTokenHash(
    tokenHash: string,
  ): Promise<AdminHumanSessionRecord | null>;
  touchSession(id: string, usedAt: string): Promise<void>;
  revokeSession(id: string, revokedAt: string): Promise<void>;
  revokeSessionsForUser(userId: string, revokedAt: string): Promise<number>;

  consumeRateLimits(input: {
    rules: AdminLoginRateLimitRule[];
    now: string;
  }): Promise<AdminLoginRateLimitResult>;
}

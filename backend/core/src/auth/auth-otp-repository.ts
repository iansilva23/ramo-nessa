import type { AuthSubjectType } from './auth-session-repository.js';

export type AuthIdentityStatus = 'active' | 'suspended';

export interface AuthIdentityRecord {
  id: string;
  subjectId: string;
  subjectType: AuthSubjectType;
  phoneE164: string;
  status: AuthIdentityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OtpChallengeRecord {
  id: string;
  identityId: string;
  codeDigest: string;
  expiresAt: string;
  attemptCount: number;
  consumedAt?: string;
  createdAt: string;
}

export interface OtpAttemptResult {
  challenge: OtpChallengeRecord;
  matched: boolean;
}

export interface AuthRateLimitRule {
  key: string;
  limit: number;
  windowMs: number;
}

export interface AuthRateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export type OtpChallengeCreationResult =
  | { created: true; challenge: OtpChallengeRecord }
  | { created: false; retryAfterMs: number };

export interface AuthOtpRepository {
  createIdentity(identity: AuthIdentityRecord): Promise<AuthIdentityRecord>;
  findOrCreatePassengerIdentity(
    identity: AuthIdentityRecord,
  ): Promise<AuthIdentityRecord>;
  findIdentityByPhone(
    subjectType: AuthSubjectType,
    phoneE164: string,
  ): Promise<AuthIdentityRecord | null>;
  findIdentityById(id: string): Promise<AuthIdentityRecord | null>;
  findIdentityBySubject(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<AuthIdentityRecord | null>;
  setIdentityStatus(input: {
    subjectType: AuthSubjectType;
    subjectId: string;
    status: AuthIdentityStatus;
    updatedAt: string;
  }): Promise<AuthIdentityRecord | null>;
  consumeRateLimits(input: {
    rules: AuthRateLimitRule[];
    now: string;
  }): Promise<AuthRateLimitResult>;
  createChallengeWithCooldown(input: {
    challenge: OtpChallengeRecord;
    now: string;
    cooldownMs: number;
  }): Promise<OtpChallengeCreationResult>;
  createChallenge(
    challenge: OtpChallengeRecord,
  ): Promise<OtpChallengeRecord>;
  findLatestChallengeByIdentityId(
    identityId: string,
  ): Promise<OtpChallengeRecord | null>;
  cancelChallenge(challengeId: string, canceledAt: string): Promise<void>;
  attemptChallenge(input: {
    challengeId: string;
    codeDigest: string;
    attemptedAt: string;
    maxAttempts: number;
  }): Promise<OtpAttemptResult | null>;
}

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

export interface AuthOtpRepository {
  createIdentity(identity: AuthIdentityRecord): Promise<AuthIdentityRecord>;
  findIdentityByPhone(
    subjectType: AuthSubjectType,
    phoneE164: string,
  ): Promise<AuthIdentityRecord | null>;
  findIdentityById(id: string): Promise<AuthIdentityRecord | null>;
  createChallenge(
    challenge: OtpChallengeRecord,
  ): Promise<OtpChallengeRecord>;
  findLatestChallengeByIdentityId(
    identityId: string,
  ): Promise<OtpChallengeRecord | null>;
  attemptChallenge(input: {
    challengeId: string;
    codeDigest: string;
    attemptedAt: string;
    maxAttempts: number;
  }): Promise<OtpAttemptResult | null>;
}

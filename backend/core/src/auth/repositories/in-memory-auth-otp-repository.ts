import type {
  AuthIdentityRecord,
  AuthIdentityStatus,
  AuthOtpRepository,
  OtpAttemptResult,
  OtpChallengeRecord,
} from '../auth-otp-repository.js';
import type { AuthSubjectType } from '../auth-session-repository.js';

export class InMemoryAuthOtpRepository implements AuthOtpRepository {
  private readonly identities = new Map<string, AuthIdentityRecord>();
  private readonly challenges = new Map<string, OtpChallengeRecord>();

  async createIdentity(
    identity: AuthIdentityRecord,
  ): Promise<AuthIdentityRecord> {
    const duplicate = [...this.identities.values()].find(
      (candidate) =>
        candidate.subjectType === identity.subjectType &&
        (candidate.phoneE164 === identity.phoneE164 ||
          candidate.subjectId === identity.subjectId),
    );
    if (duplicate != null) {
      throw new Error('Identidade de autenticação duplicada.');
    }
    this.identities.set(identity.id, structuredClone(identity));
    return structuredClone(identity);
  }

  async findIdentityByPhone(
    subjectType: AuthSubjectType,
    phoneE164: string,
  ): Promise<AuthIdentityRecord | null> {
    const found = [...this.identities.values()].find(
      (candidate) =>
        candidate.subjectType === subjectType &&
        candidate.phoneE164 === phoneE164,
    );
    return found == null ? null : structuredClone(found);
  }

  async findIdentityById(id: string): Promise<AuthIdentityRecord | null> {
    const found = this.identities.get(id);
    return found == null ? null : structuredClone(found);
  }

  async findIdentityBySubject(
    subjectType: AuthSubjectType,
    subjectId: string,
  ): Promise<AuthIdentityRecord | null> {
    const found = [...this.identities.values()].find(
      (candidate) =>
        candidate.subjectType === subjectType &&
        candidate.subjectId === subjectId,
    );
    return found == null ? null : structuredClone(found);
  }

  async setIdentityStatus(input: {
    subjectType: AuthSubjectType;
    subjectId: string;
    status: AuthIdentityStatus;
    updatedAt: string;
  }): Promise<AuthIdentityRecord | null> {
    const identity = [...this.identities.values()].find(
      (candidate) =>
        candidate.subjectType === input.subjectType &&
        candidate.subjectId === input.subjectId,
    );
    if (identity == null) return null;

    const updated = {
      ...identity,
      status: input.status,
      updatedAt: input.updatedAt,
    };
    this.identities.set(updated.id, updated);
    return structuredClone(updated);
  }

  async createChallenge(
    challenge: OtpChallengeRecord,
  ): Promise<OtpChallengeRecord> {
    this.challenges.set(challenge.id, structuredClone(challenge));
    return structuredClone(challenge);
  }

  async findLatestChallengeByIdentityId(
    identityId: string,
  ): Promise<OtpChallengeRecord | null> {
    const found = [...this.challenges.values()]
      .filter((candidate) => candidate.identityId === identityId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
    return found == null ? null : structuredClone(found);
  }

  async cancelChallenge(
    challengeId: string,
    canceledAt: string,
  ): Promise<void> {
    const challenge = this.challenges.get(challengeId);
    if (challenge == null || challenge.consumedAt != null) return;
    this.challenges.set(challengeId, {
      ...challenge,
      consumedAt: canceledAt,
    });
  }

  async attemptChallenge(input: {
    challengeId: string;
    codeDigest: string;
    attemptedAt: string;
    maxAttempts: number;
  }): Promise<OtpAttemptResult | null> {
    const challenge = this.challenges.get(input.challengeId);
    if (
      challenge == null ||
      challenge.consumedAt != null ||
      Date.parse(challenge.expiresAt) <= Date.parse(input.attemptedAt) ||
      challenge.attemptCount >= input.maxAttempts
    ) {
      return null;
    }

    const matched = challenge.codeDigest === input.codeDigest;
    const updated: OtpChallengeRecord = {
      ...challenge,
      attemptCount: challenge.attemptCount + 1,
      ...(matched ? { consumedAt: input.attemptedAt } : {}),
    };
    this.challenges.set(updated.id, updated);
    return { challenge: structuredClone(updated), matched };
  }
}

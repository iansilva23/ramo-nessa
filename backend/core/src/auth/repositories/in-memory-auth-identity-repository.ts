import type {
  AuthFederatedIdentityRecord,
  AuthFederatedProvider,
  AuthIdentityListInput,
  AuthIdentityListPage,
  AuthIdentityRecord,
  AuthIdentityStatus,
  AuthIdentityStatusCounts,
  AuthIdentityRepository,
  AuthRateLimitResult,
} from '../auth-identity-repository.js';
import type { AuthSubjectType } from '../auth-session-repository.js';

function normalizePassengerDirectoryName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

interface MemoryRateLimit {
  windowStartedAt: string;
  attemptCount: number;
}

export class InMemoryAuthIdentityRepository implements AuthIdentityRepository {
  private readonly identities = new Map<string, AuthIdentityRecord>();
  private readonly federatedIdentities =
      new Map<string, AuthFederatedIdentityRecord>();
  private readonly passengerPhotos = new Map<
    string,
    {
      bytes: Buffer;
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
      updatedAt: string;
    }
  >();
  private readonly rateLimits = new Map<string, MemoryRateLimit>();

  removeNewIdentity(id:string):void {this.identities.delete(id);}

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
  async findIdentityByEmail(
    subjectType: AuthSubjectType,
    emailNormalized: string,
  ): Promise<AuthIdentityRecord | null> {
    const found = [...this.identities.values()].find(
      (candidate) =>
        candidate.subjectType === subjectType &&
        candidate.emailNormalized === emailNormalized,
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

  async findFederatedIdentity(
    provider: AuthFederatedProvider,
    providerSubject: string,
  ): Promise<AuthFederatedIdentityRecord | null> {
    const found = this.federatedIdentities.get(
      provider + ':' + providerSubject,
    );
    return found == null ? null : structuredClone(found);
  }

  async findFederatedIdentityForAccount(input: {
    provider: AuthFederatedProvider;
    identityId: string;
  }): Promise<AuthFederatedIdentityRecord | null> {
    const found = [...this.federatedIdentities.values()].find(
      (candidate) =>
        candidate.provider === input.provider &&
        candidate.identityId === input.identityId,
    );
    return found == null ? null : structuredClone(found);
  }

  async linkFederatedIdentity(
    record: AuthFederatedIdentityRecord,
  ): Promise<AuthFederatedIdentityRecord> {
    const key = record.provider + ':' + record.providerSubject;
    const current = this.federatedIdentities.get(key);
    if (
      current != null &&
      current.identityId !== record.identityId
    ) {
      throw new Error(
        'Identidade social já vinculada a outra conta.',
      );
    }

    const duplicateForAccount =
      [...this.federatedIdentities.values()].find(
        (candidate) =>
          candidate.provider === record.provider &&
          candidate.identityId === record.identityId &&
          candidate.providerSubject !== record.providerSubject,
      );
    if (duplicateForAccount != null) {
      throw new Error(
        'Conta já possui outro vínculo com este provedor.',
      );
    }

    this.federatedIdentities.set(
      key,
      structuredClone(record),
    );
    return structuredClone(record);
  }

  async setIdentityEmail(input: {
    subjectType: AuthSubjectType;
    subjectId: string;
    emailNormalized: string;
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
      emailNormalized: input.emailNormalized,
      updatedAt: input.updatedAt,
    };
    this.identities.set(updated.id, updated);
    return structuredClone(updated);
  }

  async setPassengerAccount(input: {
    subjectId: string;
    fullName?: string | null;
    emailNormalized?: string | null;
    passwordHash?: string;
    photoUrl?: string | null;
    updatedAt: string;
  }): Promise<AuthIdentityRecord | null> {
    const identity = [...this.identities.values()].find(
      (candidate) =>
        candidate.subjectType === 'passenger' &&
        candidate.subjectId === input.subjectId,
    );
    if (identity == null) return null;

    const updated: AuthIdentityRecord = {
      ...identity,
      ...(input.fullName == null ? {} : { fullName: input.fullName }),
      ...(input.emailNormalized == null
        ? {}
        : { emailNormalized: input.emailNormalized }),
      ...(input.passwordHash == null
        ? {}
        : { passwordHash: input.passwordHash }),
      ...(input.photoUrl == null
        ? {}
        : { photoUrl: input.photoUrl }),
      updatedAt: input.updatedAt,
    };
    if (input.fullName === null) {
      delete updated.fullName;
    }
    if (input.emailNormalized === null) {
      delete updated.emailNormalized;
    }
    if (input.photoUrl === null) {
      delete updated.photoUrl;
    }
    this.identities.set(updated.id, updated);
    return structuredClone(updated);
  }

  async updatePassengerProfilePhoto(input: {
    subjectId: string;
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    updatedAt: string;
  }): Promise<AuthIdentityRecord | null> {
    const identity = [...this.identities.values()].find(
      (candidate) =>
        candidate.subjectType === 'passenger' &&
        candidate.subjectId === input.subjectId,
    );
    if (identity == null) return null;

    this.passengerPhotos.set(input.subjectId, {
      bytes: Buffer.from(input.bytes),
      mimeType: input.mimeType,
      updatedAt: input.updatedAt,
    });

    const updated: AuthIdentityRecord = {
      ...identity,
      photoUpdatedAt: input.updatedAt,
      updatedAt: input.updatedAt,
    };
    delete updated.photoUrl;
    this.identities.set(updated.id, updated);
    return structuredClone(updated);
  }

  async findPassengerProfilePhoto(subjectId: string): Promise<{
    bytes: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    updatedAt: string;
  } | null> {
    const found = this.passengerPhotos.get(subjectId);
    if (found == null) return null;
    return {
      bytes: Buffer.from(found.bytes),
      mimeType: found.mimeType,
      updatedAt: found.updatedAt,
    };
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
      ...(input.subjectType === 'driver' && input.status === 'active' ? { driverRegistrationOnly: false } : {}),
      updatedAt: input.updatedAt,
    };
    this.identities.set(updated.id, updated);
    return structuredClone(updated);
  }

  async listIdentities(
    input: AuthIdentityListInput,
  ): Promise<AuthIdentityListPage> {
    const search = input.search?.trim().toLowerCase();
    const cursorTime =
      input.cursor == null ? null : Date.parse(input.cursor.updatedAt);

    const filtered = [...this.identities.values()]
      .filter((identity) => identity.subjectType === input.subjectType)
      .filter(
        (identity) =>
          input.status == null || identity.status === input.status,
      )
      .filter((identity) => {
        if (!search) return true;
        return (
          (input.subjectType === 'passenger' &&
            identity.fullName != null &&
            normalizePassengerDirectoryName(identity.fullName).includes(
              normalizePassengerDirectoryName(search),
            )) ||
          identity.subjectId.toLowerCase().includes(search) ||
          identity.phoneE164.toLowerCase().includes(search) ||
          identity.emailNormalized?.toLowerCase().includes(search) === true
        );
      })
      .filter((identity) => {
        if (input.cursor == null || cursorTime == null) return true;
        const time = Date.parse(identity.updatedAt);
        return (
          time < cursorTime ||
          (time === cursorTime && identity.id < input.cursor.id)
        );
      })
      .sort((a, b) => {
        const timeDiff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });

    const rows = filtered.slice(0, input.limit + 1);
    const hasMore = rows.length > input.limit;
    const identities = rows.slice(0, input.limit).map((identity) =>
      structuredClone(identity),
    );
    return { identities, hasMore };
  }

  async countIdentitiesByStatus(
    subjectType: AuthSubjectType,
  ): Promise<AuthIdentityStatusCounts> {
    const identities = [...this.identities.values()].filter(
      (identity) => identity.subjectType === subjectType,
    );
    const active = identities.filter(
      (identity) => identity.status === 'active',
    ).length;
    const suspended = identities.filter(
      (identity) => identity.status === 'suspended',
    ).length;
    return {
      total: identities.length,
      active,
      suspended,
    };
  }

  async consumeRateLimits(input: {
    rules: Array<{ key: string; limit: number; windowMs: number }>;
    now: string;
  }): Promise<AuthRateLimitResult> {
    const nowMs = Date.parse(input.now);
    const retentionMs = 48 * 60 * 60 * 1000;
    for (const [key, value] of this.rateLimits) {
      if (nowMs - Date.parse(value.windowStartedAt) >= retentionMs) {
        this.rateLimits.delete(key);
      }
    }

    const staged = new Map<string, MemoryRateLimit>();

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

import type {
  AdminApiKeyRecord,
  AdminAuditRecord,
  AdminAuditSearchPage,
  AdminAuditSearchQuery,
  AdminRepository,
} from '../admin-repository.js';

export class InMemoryAdminRepository implements AdminRepository {
  private readonly keys = new Map<string, AdminApiKeyRecord>();
  private readonly audit = new Map<string, AdminAuditRecord>();

  async createApiKey(record: AdminApiKeyRecord): Promise<AdminApiKeyRecord> {
    const duplicate = [...this.keys.values()].find(
      (candidate) => candidate.tokenHash === record.tokenHash,
    );
    if (duplicate != null) {
      throw new Error('Hash de chave administrativa duplicado.');
    }
    this.keys.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async findApiKeyByTokenHash(
    tokenHash: string,
  ): Promise<AdminApiKeyRecord | null> {
    const found = [...this.keys.values()].find(
      (candidate) => candidate.tokenHash === tokenHash,
    );
    return found == null ? null : structuredClone(found);
  }

  async touchApiKeyLastUsed(id: string, usedAt: string): Promise<void> {
    const found = this.keys.get(id);
    if (found == null) return;
    this.keys.set(id, { ...found, lastUsedAt: usedAt });
  }

  async revokeApiKey(id: string, revokedAt: string): Promise<boolean> {
    const found = this.keys.get(id);
    if (found == null) return false;
    this.keys.set(id, {
      ...found,
      revokedAt: found.revokedAt ?? revokedAt,
    });
    return true;
  }

  async appendAudit(record: AdminAuditRecord): Promise<AdminAuditRecord> {
    this.audit.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async listAudit(limit: number): Promise<AdminAuditRecord[]> {
    return [...this.audit.values()]
      .sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
      )
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map((record) => structuredClone(record));
  }

  async searchAudit(
    query: AdminAuditSearchQuery,
  ): Promise<AdminAuditSearchPage> {
    const limit = Math.max(1, Math.min(100, Math.trunc(query.limit)));
    const search = query.search?.toLocaleLowerCase('pt-BR') ?? '';

    const filtered = [...this.audit.values()]
      .filter((record) => {
        if (
          query.actorKind != null &&
          record.actor.kind !== query.actorKind
        ) {
          return false;
        }
        if (query.action != null && record.action !== query.action) {
          return false;
        }
        if (
          query.targetType != null &&
          record.targetType !== query.targetType
        ) {
          return false;
        }
        if (search) {
          const haystack = [
            record.actor.name,
            record.action,
            record.targetType,
            record.targetId,
          ]
            .join(' ')
            .toLocaleLowerCase('pt-BR');
          if (!haystack.includes(search)) return false;
        }
        if (query.cursor != null) {
          const older =
            record.createdAt < query.cursor.createdAt ||
            (record.createdAt === query.cursor.createdAt &&
              record.id < query.cursor.id);
          if (!older) return false;
        }
        return true;
      })
      .sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
      );

    const page = filtered.slice(0, limit + 1);
    return {
      records: page.slice(0, limit).map((record) =>
        structuredClone(record),
      ),
      hasMore: page.length > limit,
    };
  }
}

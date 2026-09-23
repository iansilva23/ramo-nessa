import type {
  AdminApiKeyRecord,
  AdminAuditRecord,
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
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map((record) => structuredClone(record));
  }
}

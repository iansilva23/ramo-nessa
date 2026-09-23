export const ADMIN_SCOPES = [
  'drivers:auth:read',
  'drivers:auth:write',
  'audit:read',
] as const;

export type AdminScope = (typeof ADMIN_SCOPES)[number];

export interface AdminApiKeyRecord {
  id: string;
  name: string;
  tokenHash: string;
  scopes: AdminScope[];
  expiresAt: string;
  createdAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
}

export interface AdminAuditRecord {
  id: string;
  actorKeyId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminRepository {
  createApiKey(record: AdminApiKeyRecord): Promise<AdminApiKeyRecord>;
  findApiKeyByTokenHash(tokenHash: string): Promise<AdminApiKeyRecord | null>;
  touchApiKeyLastUsed(id: string, usedAt: string): Promise<void>;
  revokeApiKey(id: string, revokedAt: string): Promise<boolean>;
  appendAudit(record: AdminAuditRecord): Promise<AdminAuditRecord>;
  listAudit(limit: number): Promise<AdminAuditRecord[]>;
}

export const ADMIN_SCOPES = [
  'drivers:auth:read',
  'drivers:auth:write',
  'passengers:auth:read',
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

export interface AdminActor {
  kind: 'api_key' | 'user';
  id: string;
  name: string;
}

export interface AdminAuditRecord {
  id: string;
  actor: AdminActor;
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

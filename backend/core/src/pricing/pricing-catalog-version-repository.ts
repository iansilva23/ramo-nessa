import type { AdminActor, AdminAuditRecord, AdminRepository } from '../admin/admin-repository.js';
import type { PricingCatalogSnapshot } from './admin-catalog.js';

export type PricingCatalogVersionStatus = 'draft' | 'published';

export interface PricingCatalogVersionRecord {
  id: string;
  versionNumber: number;
  status: PricingCatalogVersionStatus;
  snapshot: PricingCatalogSnapshot;
  effectiveFrom?: string;
  createdBy: AdminActor;
  publishedBy?: AdminActor;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface PricingCatalogVersionRepository {
  // One direct save, immutable history, optimistic concurrency and audit.
  // Optional for old test adapters; writes fail closed if unsupported.
  commitDirect?(input: {
    record: Omit<PricingCatalogVersionRecord, 'versionNumber'>;
    expectedEffectiveId: string | null;
    audit: AdminAuditRecord;
    admin: AdminRepository;
  }): Promise<PricingCatalogVersionRecord | null>;

  createDraft(input: {
    id: string;
    snapshot: PricingCatalogSnapshot;
    createdBy: AdminActor;
    createdAt: string;
  }): Promise<PricingCatalogVersionRecord>;

  findById(id: string): Promise<PricingCatalogVersionRecord | null>;

  list(limit: number): Promise<PricingCatalogVersionRecord[]>;

  updateDraftSnapshot(input: {
    id: string;
    snapshot: PricingCatalogSnapshot;
    expectedUpdatedAt: string;
    updatedAt: string;
  }): Promise<PricingCatalogVersionRecord | null>;

  publish(input: {
    id: string;
    expectedUpdatedAt: string;
    effectiveFrom: string;
    publishedBy: AdminActor;
    publishedAt: string;
  }): Promise<PricingCatalogVersionRecord | null>;

  deleteDraft(input: {
    id: string;
    expectedUpdatedAt: string;
  }): Promise<PricingCatalogVersionRecord | null>;

  findEffective(at: string): Promise<PricingCatalogVersionRecord | null>;
}

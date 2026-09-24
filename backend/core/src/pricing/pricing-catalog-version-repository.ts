import type { AdminActor } from '../admin/admin-repository.js';
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
    updatedAt: string;
  }): Promise<PricingCatalogVersionRecord | null>;

  publish(input: {
    id: string;
    effectiveFrom: string;
    publishedBy: AdminActor;
    publishedAt: string;
  }): Promise<PricingCatalogVersionRecord | null>;

  findEffective(at: string): Promise<PricingCatalogVersionRecord | null>;
}

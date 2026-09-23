import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from '../admin/admin-repository.js';
import {
  adminPricingCatalogView,
  type PricingCatalogSnapshot,
} from './admin-catalog.js';
import type {
  PricingCatalogVersionRecord,
  PricingCatalogVersionRepository,
} from './pricing-catalog-version-repository.js';

export class PricingCatalogVersionError extends Error {
  constructor(
    public readonly code:
      | 'PRICING_VERSION_NOT_FOUND'
      | 'PRICING_VERSION_NOT_DRAFT'
      | 'INVALID_EFFECTIVE_FROM',
    message: string,
  ) {
    super(message);
    this.name = 'PricingCatalogVersionError';
  }
}

export function pricingCatalogVersionView(
  record: PricingCatalogVersionRecord,
) {
  return {
    id: record.id,
    versionNumber: record.versionNumber,
    status: record.status,
    catalogVersion: record.snapshot.catalogVersion,
    effectiveFrom: record.effectiveFrom ?? null,
    createdBy: record.createdBy,
    publishedBy: record.publishedBy ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt ?? null,
    summary: {
      commissionBps: record.snapshot.commissionBps,
      preaLocalities: record.snapshot.localities.prea.length,
      jijocaLocalities: record.snapshot.localities.jijoca.length,
      fixedRoutes: record.snapshot.fixedRoutes.length,
    },
  };
}

export async function createPricingCatalogDraft(input: {
  versions: PricingCatalogVersionRepository;
  admin: AdminRepository;
  actor: AdminActor;
  now?: Date;
  snapshot?: PricingCatalogSnapshot;
}): Promise<PricingCatalogVersionRecord> {
  const instant = (input.now ?? new Date()).toISOString();
  const draft = await input.versions.createDraft({
    id: randomUUID(),
    snapshot: input.snapshot ?? adminPricingCatalogView(),
    createdBy: input.actor,
    createdAt: instant,
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'pricing.catalog_version.created',
    targetType: 'pricing_catalog_version',
    targetId: draft.id,
    metadata: {
      versionNumber: draft.versionNumber,
      sourceCatalogVersion: draft.snapshot.catalogVersion,
    },
    createdAt: instant,
  });

  return draft;
}

export async function publishPricingCatalogVersion(input: {
  versions: PricingCatalogVersionRepository;
  admin: AdminRepository;
  actor: AdminActor;
  versionId: string;
  effectiveFrom?: string;
  now?: Date;
}): Promise<PricingCatalogVersionRecord> {
  const now = input.now ?? new Date();
  const current = await input.versions.findById(input.versionId);
  if (current == null) {
    throw new PricingCatalogVersionError(
      'PRICING_VERSION_NOT_FOUND',
      'Versão de preços não encontrada.',
    );
  }
  if (current.status !== 'draft') {
    throw new PricingCatalogVersionError(
      'PRICING_VERSION_NOT_DRAFT',
      'Somente uma versão em rascunho pode ser publicada.',
    );
  }

  const effectiveFrom = input.effectiveFrom?.trim()
    ? input.effectiveFrom.trim()
    : now.toISOString();
  if (!Number.isFinite(Date.parse(effectiveFrom))) {
    throw new PricingCatalogVersionError(
      'INVALID_EFFECTIVE_FROM',
      'effectiveFrom deve ser uma data ISO válida.',
    );
  }

  const published = await input.versions.publish({
    id: input.versionId,
    effectiveFrom: new Date(effectiveFrom).toISOString(),
    publishedBy: input.actor,
    publishedAt: now.toISOString(),
  });
  if (published == null) {
    throw new PricingCatalogVersionError(
      'PRICING_VERSION_NOT_DRAFT',
      'A versão deixou de estar disponível para publicação.',
    );
  }

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'pricing.catalog_version.published',
    targetType: 'pricing_catalog_version',
    targetId: published.id,
    metadata: {
      versionNumber: published.versionNumber,
      effectiveFrom: published.effectiveFrom,
    },
    createdAt: now.toISOString(),
  });

  return published;
}

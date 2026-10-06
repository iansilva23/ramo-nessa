import {
  STATIC_PRICING_CATALOG_V1,
  type PricingCatalogSnapshot,
} from './catalog-snapshot.js';
import type {
  PricingCatalogVersionRecord,
  PricingCatalogVersionRepository,
} from './pricing-catalog-version-repository.js';

export interface PricingCatalogReference {
  catalogVersion: string;
  catalogVersionId?: string;
  catalogVersionNumber?: number;
}

export interface PricingCatalogContext {
  snapshot: PricingCatalogSnapshot;
  reference: PricingCatalogReference;
  version: PricingCatalogVersionRecord | null;
}

export async function resolvePricingCatalogContext(input: {
  versions: PricingCatalogVersionRepository;
  at?: Date;
}): Promise<PricingCatalogContext> {
  const at = input.at ?? new Date();
  const version = await input.versions.findEffective(at.toISOString());

  if (version == null) {
    return {
      snapshot: STATIC_PRICING_CATALOG_V1,
      reference: {
        catalogVersion: STATIC_PRICING_CATALOG_V1.catalogVersion,
      },
      version: null,
    };
  }

  return {
    snapshot: version.snapshot,
    reference: {
      catalogVersion: version.snapshot.catalogVersion,
      catalogVersionId: version.id,
      catalogVersionNumber: version.versionNumber,
    },
    version,
  };
}

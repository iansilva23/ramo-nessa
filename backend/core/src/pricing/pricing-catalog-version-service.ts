import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from '../admin/admin-repository.js';
import {
  STATIC_PRICING_CATALOG_V1,
  type PricingCatalogSnapshot,
} from './catalog-snapshot.js';
import type {
  PricingCatalogVersionRecord,
  PricingCatalogVersionRepository,
} from './pricing-catalog-version-repository.js';
import type { PricingCatalogDraftPatch } from './pricing-catalog-version-validation.js';

export class PricingCatalogVersionError extends Error {
  constructor(
    public readonly code:
      | 'PRICING_VERSION_NOT_FOUND'
      | 'PRICING_VERSION_NOT_DRAFT'
      | 'PRICING_VERSION_CONFLICT'
      | 'PRICING_RULE_NOT_FOUND'
      | 'PRICING_STRUCTURE_CONFLICT'
      | 'INVALID_EFFECTIVE_FROM',
    message: string,
  ) {
    super(message);
    this.name = 'PricingCatalogVersionError';
  }
}

function nextPricingMutationInstant(
  currentUpdatedAt: string,
  now = new Date(),
): string {
  const currentMs = Date.parse(currentUpdatedAt);
  const requestedMs = now.getTime();
  return new Date(
    Number.isFinite(currentMs)
      ? Math.max(requestedMs, currentMs + 1)
      : requestedMs,
  ).toISOString();
}

function assertExpectedPricingVersion(
  current: PricingCatalogVersionRecord,
  expectedUpdatedAt?: string,
): void {
  if (
    expectedUpdatedAt != null &&
    expectedUpdatedAt !== current.updatedAt
  ) {
    throw new PricingCatalogVersionError(
      'PRICING_VERSION_CONFLICT',
      'Este rascunho foi alterado por outro operador. Reabra a versão antes de salvar ou publicar.',
    );
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
      preaLocalities: Object.keys(record.snapshot.localities.prea).length,
      jijocaLocalities: Object.keys(record.snapshot.localities.jijoca).length,
      fixedRoutes: record.snapshot.fixedRoutes.length,
      enabledCategories: record.snapshot.categories.filter(
        (category) =>
          record.snapshot.categoryPolicies[category].enabled,
      ).length,
      enabledZones: record.snapshot.zones.filter(
        (zoneId) => record.snapshot.zonePolicies[zoneId].enabled,
      ).length,
      externalLocalities: record.snapshot.externalLocalities.length,
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
    snapshot:
      input.snapshot ?? structuredClone(STATIC_PRICING_CATALOG_V1),
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

export async function updatePricingCatalogDraft(input: {
  versions: PricingCatalogVersionRepository;
  admin: AdminRepository;
  actor: AdminActor;
  versionId: string;
  patch: PricingCatalogDraftPatch;
  expectedUpdatedAt?: string;
  now?: Date;
}): Promise<PricingCatalogVersionRecord> {
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
      'Somente rascunhos podem ser alterados.',
    );
  }
  assertExpectedPricingVersion(current, input.expectedUpdatedAt);

  const snapshot = structuredClone(current.snapshot);
  let auditMetadata: Record<string, unknown>;

  const patch = input.patch;

  if (patch.kind === 'fixed_route') {
    const route = snapshot.fixedRoutes.find(
      (candidate) => candidate.id === patch.routeId,
    );
    if (route == null) {
      throw new PricingCatalogVersionError(
        'PRICING_RULE_NOT_FOUND',
        'Rota fixa não encontrada no catálogo.',
      );
    }
    route.dayCents = patch.dayCents;
    route.after22Cents = patch.after22Cents;
    auditMetadata = {
      kind: patch.kind,
      routeId: patch.routeId,
      dayCents: patch.dayCents,
      after22Cents: patch.after22Cents,
    };
  } else if (patch.kind === 'locality_price') {
    const locality =
      snapshot.localities[patch.hub][patch.localityId];
    if (locality == null) {
      throw new PricingCatalogVersionError(
        'PRICING_RULE_NOT_FOUND',
        'Localidade não encontrada no catálogo.',
      );
    }

    locality[patch.category] =
      patch.price.kind === 'exact'
        ? patch.price.amountCents
        : {
            minCents: patch.price.minCents,
            maxCents: patch.price.maxCents,
          };
    auditMetadata = {
      kind: patch.kind,
      hub: patch.hub,
      localityId: patch.localityId,
      category: patch.category,
      price: patch.price,
    };
  } else if (patch.kind === 'category_policy') {
    snapshot.categoryPolicies[patch.category] = {
      enabled: patch.enabled,
      requiresFourByFourOnJeriBoundary:
        patch.requiresFourByFourOnJeriBoundary,
    };
    auditMetadata = {
      kind: patch.kind,
      category: patch.category,
      enabled: patch.enabled,
      requiresFourByFourOnJeriBoundary:
        patch.requiresFourByFourOnJeriBoundary,
    };
  } else if (patch.kind === 'zone_policy') {
    snapshot.zonePolicies[patch.zoneId] = {
      enabled: patch.enabled,
    };
    auditMetadata = {
      kind: patch.kind,
      zoneId: patch.zoneId,
      enabled: patch.enabled,
    };
  } else if (patch.kind === 'commission_policy') {
    snapshot.commissionBps = patch.commissionBps;
    auditMetadata = {
      kind: patch.kind,
      commissionBps: patch.commissionBps,
    };
  } else if (patch.kind === 'period_policy') {
    snapshot.periodPolicy = {
      nightStartHour: patch.nightStartHour,
      dayStartHour: patch.dayStartHour,
    };
    auditMetadata = {
      kind: patch.kind,
      ...snapshot.periodPolicy,
    };
  } else if (patch.kind === 'pickup_policy') {
    snapshot.pickupPolicy = {
      freeKm: patch.freeKm,
      fuelPriceCentsPerLiter: patch.fuelPriceCentsPerLiter,
      motoReferenceKmPerLiter: patch.motoReferenceKmPerLiter,
      carReferenceKmPerLiter: patch.carReferenceKmPerLiter,
    };
    auditMetadata = {
      kind: patch.kind,
      ...snapshot.pickupPolicy,
    };
  } else if (patch.kind === 'surcharge_policy') {
    const unknownLocalities =
      patch.preaLocalCarAfter22LocalityIds.filter(
        (localityId) =>
          snapshot.localities.prea[localityId] == null,
      );
    if (unknownLocalities.length > 0) {
      throw new PricingCatalogVersionError(
        'PRICING_RULE_NOT_FOUND',
        `Localidade(s) noturna(s) do Preá não encontrada(s): ${unknownLocalities.join(', ')}.`,
      );
    }
    snapshot.surcharges = {
      preaComfortCents: patch.preaComfortCents,
      preaLocalCarAfter22Cents:
        patch.preaLocalCarAfter22Cents,
      preaLocalCarAfter22LocalityIds: [
        ...patch.preaLocalCarAfter22LocalityIds,
      ].sort(),
    };
    auditMetadata = {
      kind: patch.kind,
      ...snapshot.surcharges,
    };
  } else if (patch.kind === 'buggy_policy') {
    snapshot.jeri.buggy = {
      minPassengers: patch.minPassengers,
      maxPassengers: patch.maxPassengers,
      dayBaseCents: patch.dayBaseCents,
      after22BaseCents: patch.after22BaseCents,
      perPassengerCents: patch.perPassengerCents,
    };
    auditMetadata = {
      kind: patch.kind,
      ...snapshot.jeri.buggy,
    };
  } else if (patch.kind === 'delivery_bands') {
    snapshot.jeri.deliveryBands = patch.bands.map((band) => ({
      ...band,
    }));
    snapshot.jeri.deliveryAboveMaxCents = patch.aboveMaxCents;
    auditMetadata = {
      kind: patch.kind,
      bands: snapshot.jeri.deliveryBands,
      aboveMaxCents: snapshot.jeri.deliveryAboveMaxCents,
    };
  } else if (patch.kind === 'locality_geofence') {
    const localityExists =
      patch.zoneId === 'jericoacoara'
        ? patch.localityId === 'jericoacoara'
        : patch.zoneId === 'prea'
          ? snapshot.localities.prea[patch.localityId] != null
          : patch.zoneId === 'jijoca'
            ? snapshot.localities.jijoca[patch.localityId] != null
            : snapshot.externalLocalities.includes(patch.localityId);

    if (!localityExists) {
      throw new PricingCatalogVersionError(
        'PRICING_RULE_NOT_FOUND',
        'A localidade da geofence não pertence ao catálogo.',
      );
    }

    const sameLocality = (
      candidate: typeof snapshot.localityGeofences[number],
    ) =>
      candidate.zoneId === patch.zoneId &&
      candidate.localityId === patch.localityId;

    const exists = snapshot.localityGeofences.some(sameLocality);
    if (patch.operation === 'remove') {
      if (!exists) {
        throw new PricingCatalogVersionError(
          'PRICING_RULE_NOT_FOUND',
          'Geofence da localidade não encontrada.',
        );
      }
      snapshot.localityGeofences =
        snapshot.localityGeofences.filter(
          (candidate) => !sameLocality(candidate),
        );
    } else {
      const next = {
        zoneId: patch.zoneId,
        localityId: patch.localityId,
        centerLatitude: patch.centerLatitude,
        centerLongitude: patch.centerLongitude,
        radiusKm: patch.radiusKm,
      };
      snapshot.localityGeofences = exists
        ? snapshot.localityGeofences.map((candidate) =>
            sameLocality(candidate) ? next : candidate,
          )
        : [...snapshot.localityGeofences, next];
      snapshot.localityGeofences.sort((a, b) => {
        const zone = a.zoneId.localeCompare(b.zoneId);
        return zone !== 0
          ? zone
          : a.localityId.localeCompare(b.localityId);
      });
    }

    auditMetadata = {
      kind: patch.kind,
      operation: patch.operation,
      zoneId: patch.zoneId,
      localityId: patch.localityId,
      ...(patch.operation === 'upsert'
        ? {
            centerLatitude: patch.centerLatitude,
            centerLongitude: patch.centerLongitude,
            radiusKm: patch.radiusKm,
          }
        : {}),
    };
  } else {
    const referencedByFixedRoute = snapshot.fixedRoutes.some(
      (route) =>
        route.a === patch.localityId ||
        route.b === patch.localityId,
    );

    if (patch.operation === 'remove' && referencedByFixedRoute) {
      throw new PricingCatalogVersionError(
        'PRICING_STRUCTURE_CONFLICT',
        'Localidade é usada por rota fixa e não pode ser removida.',
      );
    }

    if (
      patch.operation === 'remove' &&
      ((patch.scope === 'prea' && patch.localityId === 'prea') ||
        (patch.scope === 'jijoca' &&
          patch.localityId === 'jijoca'))
    ) {
      throw new PricingCatalogVersionError(
        'PRICING_STRUCTURE_CONFLICT',
        'A localidade central da zona não pode ser removida.',
      );
    }

    if (patch.scope === 'external') {
      const exists = snapshot.externalLocalities.includes(
        patch.localityId,
      );
      if (patch.operation === 'add' && exists) {
        throw new PricingCatalogVersionError(
          'PRICING_STRUCTURE_CONFLICT',
          'Localidade externa já existe no catálogo.',
        );
      }
      if (patch.operation === 'remove' && !exists) {
        throw new PricingCatalogVersionError(
          'PRICING_RULE_NOT_FOUND',
          'Localidade externa não encontrada no catálogo.',
        );
      }
      snapshot.externalLocalities =
        patch.operation === 'add'
          ? [...snapshot.externalLocalities, patch.localityId].sort()
          : snapshot.externalLocalities.filter(
              (id) => id !== patch.localityId,
            );
      if (patch.operation === 'remove') {
        snapshot.localityGeofences =
          snapshot.localityGeofences.filter(
            (candidate) =>
              !(
                candidate.zoneId === 'external' &&
                candidate.localityId === patch.localityId
              ),
          );
      }
    } else {
      const table = snapshot.localities[patch.scope];
      const exists = table[patch.localityId] != null;
      if (patch.operation === 'add' && exists) {
        throw new PricingCatalogVersionError(
          'PRICING_STRUCTURE_CONFLICT',
          'Localidade já existe na zona.',
        );
      }
      if (patch.operation === 'remove' && !exists) {
        throw new PricingCatalogVersionError(
          'PRICING_RULE_NOT_FOUND',
          'Localidade não encontrada na zona.',
        );
      }

      if (patch.operation === 'add') {
        table[patch.localityId] = {};
      } else {
        delete table[patch.localityId];
        snapshot.localityGeofences =
          snapshot.localityGeofences.filter(
            (candidate) =>
              !(
                candidate.zoneId === patch.scope &&
                candidate.localityId === patch.localityId
              ),
          );
        if (patch.scope === 'prea') {
          snapshot.surcharges.preaLocalCarAfter22LocalityIds =
            snapshot.surcharges.preaLocalCarAfter22LocalityIds.filter(
              (id) => id !== patch.localityId,
            );
        }
      }
    }

    auditMetadata = {
      kind: patch.kind,
      operation: patch.operation,
      scope: patch.scope,
      localityId: patch.localityId,
    };
  }

  const instant = nextPricingMutationInstant(
    current.updatedAt,
    input.now,
  );
  const updated = await input.versions.updateDraftSnapshot({
    id: current.id,
    snapshot,
    expectedUpdatedAt: current.updatedAt,
    updatedAt: instant,
  });
  if (updated == null) {
    const latest = await input.versions.findById(current.id);
    if (latest?.status === 'draft') {
      throw new PricingCatalogVersionError(
        'PRICING_VERSION_CONFLICT',
        'Este rascunho mudou enquanto a alteração era salva. Reabra a versão e tente novamente.',
      );
    }
    throw new PricingCatalogVersionError(
      latest == null
        ? 'PRICING_VERSION_NOT_FOUND'
        : 'PRICING_VERSION_NOT_DRAFT',
      latest == null
        ? 'Versão de preços não encontrada.'
        : 'O rascunho deixou de estar disponível para edição.',
    );
  }

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'pricing.catalog_version.updated',
    targetType: 'pricing_catalog_version',
    targetId: updated.id,
    metadata: {
      versionNumber: updated.versionNumber,
      ...auditMetadata,
    },
    createdAt: instant,
  });

  return updated;
}

export async function publishPricingCatalogVersion(input: {
  versions: PricingCatalogVersionRepository;
  admin: AdminRepository;
  actor: AdminActor;
  versionId: string;
  expectedUpdatedAt?: string;
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
  assertExpectedPricingVersion(current, input.expectedUpdatedAt);

  const effectiveFrom = input.effectiveFrom?.trim()
    ? input.effectiveFrom.trim()
    : now.toISOString();
  if (!Number.isFinite(Date.parse(effectiveFrom))) {
    throw new PricingCatalogVersionError(
      'INVALID_EFFECTIVE_FROM',
      'effectiveFrom deve ser uma data ISO válida.',
    );
  }

  const publishedAt = nextPricingMutationInstant(
    current.updatedAt,
    now,
  );
  const published = await input.versions.publish({
    id: input.versionId,
    expectedUpdatedAt: current.updatedAt,
    effectiveFrom: new Date(effectiveFrom).toISOString(),
    publishedBy: input.actor,
    publishedAt,
  });
  if (published == null) {
    const latest = await input.versions.findById(current.id);
    if (latest?.status === 'draft') {
      throw new PricingCatalogVersionError(
        'PRICING_VERSION_CONFLICT',
        'Este rascunho mudou enquanto era publicado. Reabra a versão antes de publicar.',
      );
    }
    throw new PricingCatalogVersionError(
      latest == null
        ? 'PRICING_VERSION_NOT_FOUND'
        : 'PRICING_VERSION_NOT_DRAFT',
      latest == null
        ? 'Versão de preços não encontrada.'
        : 'A versão deixou de estar disponível para publicação.',
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
    createdAt: publishedAt,
  });

  return published;
}

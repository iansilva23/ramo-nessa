import { randomUUID } from 'node:crypto';

import type {
  OperationalSettingsRecord,
  OperationalSettingsRepository,
} from '../config/operational-settings-repository.js';
import type { AdminActor, AdminRepository } from './admin-repository.js';

export class AdminOperationalSettingsError extends Error {
  constructor(
    public readonly code: 'INVALID_DRIVER_OFFER_TTL',
    message: string,
  ) {
    super(message);
    this.name = 'AdminOperationalSettingsError';
  }
}

export async function adminOperationalSettingsView(
  repository: OperationalSettingsRepository,
): Promise<OperationalSettingsRecord> {
  return repository.get();
}

export async function updateAdminOperationalSettings(input: {
  repository: OperationalSettingsRepository;
  admin: AdminRepository;
  actor: AdminActor;
  driverOfferTtlSeconds?: number;
  showNearbyDrivers?: boolean;
  now?: Date;
}) {
  if (
    input.driverOfferTtlSeconds != null &&
    (!Number.isInteger(input.driverOfferTtlSeconds) ||
      input.driverOfferTtlSeconds < 5 ||
      input.driverOfferTtlSeconds > 120)
  ) {
    throw new AdminOperationalSettingsError(
      'INVALID_DRIVER_OFFER_TTL',
      'O tempo de oferta deve ficar entre 5 e 120 segundos.',
    );
  }

  const current = await input.repository.get();
  const nextTtl =
    input.driverOfferTtlSeconds ?? current.driverOfferTtlSeconds;
  const nextNearby =
    input.showNearbyDrivers ?? current.showNearbyDrivers;

  if (
    nextTtl === current.driverOfferTtlSeconds &&
    nextNearby === current.showNearbyDrivers
  ) {
    return current;
  }

  const updatedAt = (input.now ?? new Date()).toISOString();
  const updated = await input.repository.update({
    driverOfferTtlSeconds: nextTtl,
    showNearbyDrivers: nextNearby,
    updatedAt,
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'operational_settings.updated',
    targetType: 'operational_settings',
    targetId: 'mobility',
    metadata: {
      previousDriverOfferTtlSeconds: current.driverOfferTtlSeconds,
      driverOfferTtlSeconds: updated.driverOfferTtlSeconds,
      previousShowNearbyDrivers: current.showNearbyDrivers,
      showNearbyDrivers: updated.showNearbyDrivers,
    },
    createdAt: updatedAt,
  });

  return updated;
}

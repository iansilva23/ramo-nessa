import { randomUUID } from 'node:crypto';

import type {
  OperationalSettingsRecord,
  OperationalSettingsRepository,
} from '../config/operational-settings-repository.js';
import type { AdminActor, AdminRepository } from './admin-repository.js';

export class AdminOperationalSettingsError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_DRIVER_OFFER_TTL'
      | 'INVALID_MERCADO_PAGO_PUBLIC_KEY',
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
  driverDocumentAutoEnforcement?: boolean;
  mercadoPagoPublicKey?: string | null;
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

  const normalizedPublicKey =
    input.mercadoPagoPublicKey === undefined
      ? undefined
      : input.mercadoPagoPublicKey == null
        ? null
        : input.mercadoPagoPublicKey.trim();

  if (
    normalizedPublicKey != null &&
    normalizedPublicKey.length > 0 &&
    (normalizedPublicKey.length < 20 ||
      normalizedPublicKey.length > 220 ||
      /\s/.test(normalizedPublicKey))
  ) {
    throw new AdminOperationalSettingsError(
      'INVALID_MERCADO_PAGO_PUBLIC_KEY',
      'Public Key do Mercado Pago inválida.',
    );
  }

  const current = await input.repository.get();
  const nextTtl =
    input.driverOfferTtlSeconds ?? current.driverOfferTtlSeconds;
  const nextNearby =
    input.showNearbyDrivers ?? current.showNearbyDrivers;
  const nextDocumentAutoEnforcement =
    input.driverDocumentAutoEnforcement ??
    current.driverDocumentAutoEnforcement;
  const nextPublicKey =
    normalizedPublicKey === undefined
      ? current.mercadoPagoPublicKey
      : normalizedPublicKey === null || normalizedPublicKey.length === 0
        ? undefined
        : normalizedPublicKey;

  if (
    nextTtl === current.driverOfferTtlSeconds &&
    nextNearby === current.showNearbyDrivers &&
    nextDocumentAutoEnforcement ===
      current.driverDocumentAutoEnforcement &&
    nextPublicKey === current.mercadoPagoPublicKey
  ) {
    return current;
  }

  const updatedAt = (input.now ?? new Date()).toISOString();
  const updated = await input.repository.update({
    driverOfferTtlSeconds: nextTtl,
    showNearbyDrivers: nextNearby,
    driverDocumentAutoEnforcement:
      nextDocumentAutoEnforcement,
    mercadoPagoPublicKey: nextPublicKey ?? null,
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
      previousDriverDocumentAutoEnforcement:
        current.driverDocumentAutoEnforcement,
      driverDocumentAutoEnforcement:
        updated.driverDocumentAutoEnforcement,
      mercadoPagoPublicKeyChanged:
        current.mercadoPagoPublicKey !== updated.mercadoPagoPublicKey,
    },
    createdAt: updatedAt,
  });

  return updated;
}

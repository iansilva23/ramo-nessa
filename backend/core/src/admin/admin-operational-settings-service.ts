import type { DriverSearchPolicy } from '../matching/driver-search-policy.js';
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
      | 'INVALID_DRIVER_PAYMENT_HOLD'
      | 'INVALID_DRIVER_SEARCH_DISTANCE'
      | 'INVALID_NO_DRIVER_DECISION_TIMEOUT'
      | 'INVALID_DRIVER_LOCATION_MAX_AGE'
      | 'INVALID_NEARBY_DRIVER_MAX_DISTANCE'
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
  driverPaymentHoldSeconds?: number;
  driverSearchMaxDistanceKm?: number;
  driverSearchPolicy?: DriverSearchPolicy;
  noDriverDecisionTimeoutSeconds?: number;
  driverLocationMaxAgeSeconds?: number;
  nearbyDriverMaxDistanceKm?: number;
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

  if (
    input.driverPaymentHoldSeconds != null &&
    (!Number.isInteger(input.driverPaymentHoldSeconds) ||
      input.driverPaymentHoldSeconds < 30 ||
      input.driverPaymentHoldSeconds > 300)
  ) {
    throw new AdminOperationalSettingsError(
      'INVALID_DRIVER_PAYMENT_HOLD',
      'A reserva durante o pagamento deve ficar entre 30 e 300 segundos.',
    );
  }

  if (
    input.noDriverDecisionTimeoutSeconds != null &&
    (!Number.isInteger(input.noDriverDecisionTimeoutSeconds) ||
      input.noDriverDecisionTimeoutSeconds < 60 ||
      input.noDriverDecisionTimeoutSeconds > 3600)
  ) {
    throw new AdminOperationalSettingsError(
      'INVALID_NO_DRIVER_DECISION_TIMEOUT',
      'O prazo para decidir após não encontrar motorista deve ficar entre 60 e 3600 segundos.',
    );
  }

  if (
    input.driverLocationMaxAgeSeconds != null &&
    (!Number.isInteger(input.driverLocationMaxAgeSeconds) ||
      input.driverLocationMaxAgeSeconds < 15 ||
      input.driverLocationMaxAgeSeconds > 600)
  ) {
    throw new AdminOperationalSettingsError(
      'INVALID_DRIVER_LOCATION_MAX_AGE',
      'A validade máxima do GPS deve ficar entre 15 e 600 segundos.',
    );
  }

  if (
    input.nearbyDriverMaxDistanceKm != null &&
    (!Number.isFinite(input.nearbyDriverMaxDistanceKm) ||
      input.nearbyDriverMaxDistanceKm < 0.5 ||
      input.nearbyDriverMaxDistanceKm > 100)
  ) {
    throw new AdminOperationalSettingsError(
      'INVALID_NEARBY_DRIVER_MAX_DISTANCE',
      'A distância de motoristas próximos deve ficar entre 0,5 e 100 km.',
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

  if (input.driverSearchMaxDistanceKm != null &&
      (!Number.isFinite(input.driverSearchMaxDistanceKm) || input.driverSearchMaxDistanceKm < 0.5 || input.driverSearchMaxDistanceKm > 100)) {
    throw new AdminOperationalSettingsError('INVALID_DRIVER_SEARCH_DISTANCE', 'A busca deve ficar entre 0,5 e 100 km.');
  }
  const current = await input.repository.get();
  const nextSearchDistance = input.driverSearchMaxDistanceKm ?? current.driverSearchMaxDistanceKm ?? 5;
  const nextTtl =
    input.driverOfferTtlSeconds ?? current.driverOfferTtlSeconds;
  const nextPaymentHold =
    input.driverPaymentHoldSeconds ??
    current.driverPaymentHoldSeconds;
  const nextNoDriverDecisionTimeout =
    input.noDriverDecisionTimeoutSeconds ??
    current.noDriverDecisionTimeoutSeconds;
  const nextLocationMaxAge =
    input.driverLocationMaxAgeSeconds ??
    current.driverLocationMaxAgeSeconds;
  const nextNearbyDistance =
    input.nearbyDriverMaxDistanceKm ??
    current.nearbyDriverMaxDistanceKm;
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
    input.driverSearchPolicy === undefined &&
    nextSearchDistance === (current.driverSearchMaxDistanceKm ?? 5) &&
    nextTtl === current.driverOfferTtlSeconds &&
    nextPaymentHold === current.driverPaymentHoldSeconds &&
    nextNoDriverDecisionTimeout ===
      current.noDriverDecisionTimeoutSeconds &&
    nextLocationMaxAge === current.driverLocationMaxAgeSeconds &&
    nextNearbyDistance === current.nearbyDriverMaxDistanceKm &&
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
    driverSearchMaxDistanceKm: nextSearchDistance,
    ...(input.driverSearchPolicy == null ? {} : { driverSearchPolicy: input.driverSearchPolicy }),
    driverPaymentHoldSeconds: nextPaymentHold,
    noDriverDecisionTimeoutSeconds: nextNoDriverDecisionTimeout,
    driverLocationMaxAgeSeconds: nextLocationMaxAge,
    nearbyDriverMaxDistanceKm: nextNearbyDistance,
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
      previousDriverSearchPolicy: current.driverSearchPolicy ?? null,
      driverSearchPolicy: updated.driverSearchPolicy ?? null,
      previousDriverSearchMaxDistanceKm: current.driverSearchMaxDistanceKm ?? 5,
      driverSearchMaxDistanceKm: updated.driverSearchMaxDistanceKm,
      previousDriverOfferTtlSeconds: current.driverOfferTtlSeconds,
      driverOfferTtlSeconds: updated.driverOfferTtlSeconds,
      previousDriverPaymentHoldSeconds:
        current.driverPaymentHoldSeconds,
      driverPaymentHoldSeconds:
        updated.driverPaymentHoldSeconds,
      previousNoDriverDecisionTimeoutSeconds:
        current.noDriverDecisionTimeoutSeconds,
      noDriverDecisionTimeoutSeconds:
        updated.noDriverDecisionTimeoutSeconds,
      previousDriverLocationMaxAgeSeconds:
        current.driverLocationMaxAgeSeconds,
      driverLocationMaxAgeSeconds:
        updated.driverLocationMaxAgeSeconds,
      previousNearbyDriverMaxDistanceKm:
        current.nearbyDriverMaxDistanceKm,
      nearbyDriverMaxDistanceKm:
        updated.nearbyDriverMaxDistanceKm,
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

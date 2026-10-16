import type { DriverSearchPolicy } from '../matching/driver-search-policy.js';
export interface OperationalSettingsRecord {
  driverOfferTtlSeconds: number;
  driverPaymentHoldSeconds: number;
  driverSearchMaxDistanceKm?: number;
  driverSearchPolicy?: DriverSearchPolicy;
  noDriverDecisionTimeoutSeconds: number;
  driverLocationMaxAgeSeconds: number;
  nearbyDriverMaxDistanceKm: number;
  showNearbyDrivers: boolean;
  driverDocumentAutoEnforcement: boolean;
  mercadoPagoPublicKey?: string;
  updatedAt: string;
}

export interface OperationalSettingsRepository {
  get(): Promise<OperationalSettingsRecord>;
  update(input: {
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
    updatedAt: string;
  }): Promise<OperationalSettingsRecord>;
}

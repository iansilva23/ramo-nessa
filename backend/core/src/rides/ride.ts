import type { PaymentStatus } from '../payments/payment-state.js';
import type { RidePaymentMethod } from '../payments/payment-policy.js';
import type {
  ExactFare,
  LocationRef,
  PricePeriod,
  ServiceCategory,
} from '../pricing/types.js';
import type { RideState } from './ride-state.js';

export interface RideQuoteSnapshot {
  ruleId: string;
  catalogVersion?: string;
  catalogVersionId?: string;
  catalogVersionNumber?: number;
  baseAmountCents: number;
  pickupCompensationCents: number;
  totalAmountCents: number;
  platformCommissionCents: number;
  driverNetCents: number;
}

export interface RideRecord {
  id: string;
  passengerId: string;
  state: RideState;
  paymentStatus: PaymentStatus;
  paymentMethod?: RidePaymentMethod;
  driverId?: string;
  reservedDriverId?: string;
  driverHoldExpiresAt?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  dropoffLatitude?: number;
  dropoffLongitude?: number;

  origin: LocationRef;
  destination: LocationRef;
  category: ServiceCategory;
  requiresFourByFour?: boolean;
  period: PricePeriod;
  passengers: number;
  tripDistanceKm?: number;
  driverPickupDistanceKm?: number;

  quote: RideQuoteSnapshot;

  createdAt: string;
  updatedAt: string;
}

export function isRidePreparedForPayment(ride: RideRecord): boolean {
  return (
    ride.reservedDriverId != null &&
    ride.driverHoldExpiresAt != null &&
    ride.pickupLatitude != null &&
    ride.pickupLongitude != null &&
    ride.dropoffLatitude != null &&
    ride.dropoffLongitude != null
  );
}

export function isDriverPaymentHoldExpired(
  ride: RideRecord,
  now: Date,
): boolean {
  const hasDriver = ride.reservedDriverId != null;
  const hasExpiry = ride.driverHoldExpiresAt != null;

  if (!hasDriver && !hasExpiry) return false;
  if (!hasDriver || !hasExpiry) return true;

  const expiresAt = Date.parse(ride.driverHoldExpiresAt!);
  return Number.isNaN(expiresAt) || expiresAt <= now.getTime();
}

export function snapshotExactFare(
  fare: ExactFare,
  pricing: {
    catalogVersion?: string;
    catalogVersionId?: string;
    catalogVersionNumber?: number;
  } = {},
): RideQuoteSnapshot {
  return {
    ruleId: fare.ruleId,
    ...(pricing.catalogVersion == null
      ? {}
      : { catalogVersion: pricing.catalogVersion }),
    ...(pricing.catalogVersionId == null
      ? {}
      : { catalogVersionId: pricing.catalogVersionId }),
    ...(pricing.catalogVersionNumber == null
      ? {}
      : {
          catalogVersionNumber:
            pricing.catalogVersionNumber,
        }),
    baseAmountCents: fare.baseAmountCents,
    pickupCompensationCents: fare.pickupCompensationCents,
    totalAmountCents: fare.totalAmountCents,
    platformCommissionCents: fare.platformCommissionCents,
    driverNetCents: fare.driverNetCents,
  };
}

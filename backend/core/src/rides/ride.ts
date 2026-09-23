import type { PaymentStatus } from '../payments/payment-state.js';
import type {
  ExactFare,
  LocationRef,
  PricePeriod,
  ServiceCategory,
} from '../pricing/types.js';
import type { RideState } from './ride-state.js';

export interface RideQuoteSnapshot {
  ruleId: string;
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
  driverId?: string;
  reservedDriverId?: string;
  driverHoldExpiresAt?: string;

  origin: LocationRef;
  destination: LocationRef;
  category: ServiceCategory;
  period: PricePeriod;
  passengers: number;
  tripDistanceKm?: number;
  driverPickupDistanceKm?: number;

  quote: RideQuoteSnapshot;

  createdAt: string;
  updatedAt: string;
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

export function snapshotExactFare(fare: ExactFare): RideQuoteSnapshot {
  return {
    ruleId: fare.ruleId,
    baseAmountCents: fare.baseAmountCents,
    pickupCompensationCents: fare.pickupCompensationCents,
    totalAmountCents: fare.totalAmountCents,
    platformCommissionCents: fare.platformCommissionCents,
    driverNetCents: fare.driverNetCents,
  };
}

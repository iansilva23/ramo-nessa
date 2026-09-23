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

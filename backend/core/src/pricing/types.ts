export type ZoneId = 'jericoacoara' | 'jijoca' | 'prea' | 'external';

export type ServiceCategory =
  | 'moto'
  | 'delivery'
  | 'car'
  | 'comfort_black'
  | 'buggy';

export type PricePeriod = 'day' | 'after_22';

export interface LocationRef {
  zoneId: ZoneId;
  localityId?: string;
}

export interface QuoteRequest {
  origin: LocationRef;
  destination: LocationRef;
  category: ServiceCategory;
  period: PricePeriod;
  tripDistanceKm?: number;
  passengers?: number;
  driverPickupDistanceKm?: number;
}

export interface ExactFare {
  kind: 'exact';
  ruleId: string;
  baseAmountCents: number;
  pickupCompensationCents: number;
  totalAmountCents: number;
  platformCommissionCents: number;
  driverNetCents: number;
}

export interface FareRange {
  kind: 'range';
  ruleId: string;
  minBaseAmountCents: number;
  maxBaseAmountCents: number;
  pickupCompensationCents: number;
  minTotalAmountCents: number;
  maxTotalAmountCents: number;
  minPlatformCommissionCents: number;
  maxPlatformCommissionCents: number;
  minDriverNetCents: number;
  maxDriverNetCents: number;
  requiresExactResolution: true;
}

export type FareQuote = ExactFare | FareRange;

export class PricingError extends Error {
  constructor(
    public readonly code:
      | 'UNAVAILABLE_CATEGORY'
      | 'UNKNOWN_ROUTE'
      | 'MISSING_DISTANCE'
      | 'INVALID_PASSENGER_COUNT',
    message: string,
  ) {
    super(message);
    this.name = 'PricingError';
  }
}

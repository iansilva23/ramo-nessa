import type { RideRecord } from '../rides/ride.js';
import type { RideRepository } from '../rides/ride-repository.js';

export const PROMOTION_KINDS = [
  'wallet_credit',
  'fixed_discount',
  'percent_discount',
  'free_ride',
  'fixed_driver_fare',
] as const;

export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMOTION_CATEGORIES = [
  'moto',
  'delivery',
  'car',
  'comfort_black',
  'buggy',
] as const;

export type PromotionCategory =
  (typeof PROMOTION_CATEGORIES)[number];

export interface PromotionCampaignRecord {
  id: string;
  code: string;
  name: string;
  kind: PromotionKind;
  valueCents?: number;
  percentBps?: number;
  maxDiscountCents?: number;
  fixedDriverFareCents?: number;
  fixedDriverFaresByCategory?: Partial<Record<PromotionCategory, number>>;
  categories: PromotionCategory[];
  maxRedemptions: number;
  perPassengerLimit: number;
  perDeviceLimit: number;
  startsAt?: string;
  endsAt?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PassengerPromotionPreferenceRecord {
  passengerId: string;
  campaignId: string;
  deviceHash: string;
  updatedAt: string;
}

export type PromotionRedemptionStatus =
  | 'reserved'
  | 'redeemed'
  | 'released';

export interface PromotionRedemptionRecord {
  id: string;
  campaignId: string;
  passengerId: string;
  deviceHash: string;
  rideId?: string;
  referenceKey: string;
  status: PromotionRedemptionStatus;
  normalTotalCents: number;
  discountCents: number;
  passengerPayableCents: number;
  driverEarningsCents: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class PromotionRepositoryError extends Error {
  constructor(
    public readonly code:
      | 'PROMOTION_NOT_FOUND'
      | 'PROMOTION_LIMIT_REACHED'
      | 'PROMOTION_PASSENGER_LIMIT_REACHED'
      | 'PROMOTION_DEVICE_LIMIT_REACHED'
      | 'PROMOTION_REFERENCE_CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'PromotionRepositoryError';
  }
}

export interface ReservePromotionRedemptionInput {
  redemption: PromotionRedemptionRecord;
  maxRedemptions: number;
  perPassengerLimit: number;
  perDeviceLimit: number;
  now: string;
  replaceRedemptionId?: string;
}

export interface RemoveRidePromotionInput {
  rides: RideRepository;
  expectedRide: RideRecord;
  updatedAt: string;
}

export interface RetainPaidPromotionInput {
  redemptionId: string;
  campaignId: string;
  rideId: string;
  passengerId: string;
  updatedAt: string;
}

export function preparePaidPromotionReservation(
  current: PromotionRedemptionRecord | null,
  input: RetainPaidPromotionInput,
): PromotionRedemptionRecord {
  if (current == null || current.campaignId !== input.campaignId ||
      current.rideId !== input.rideId || current.passengerId !== input.passengerId ||
      current.status === 'released' ||
      (current.status === 'reserved' && current.expiresAt != null &&
       current.expiresAt <= input.updatedAt)) {
    throw new PromotionRepositoryError(
      'PROMOTION_REFERENCE_CONFLICT',
      'A reserva deste cupom não está mais ativa para este pagamento.',
    );
  }
  if (current.status === 'redeemed' || current.expiresAt == null) return current;
  const { expiresAt: _expiresAt, ...retained } = current;
  return { ...retained, updatedAt: input.updatedAt };
}

export function prepareRidePromotionRemoval(
  current: RideRecord | null,
  input: RemoveRidePromotionInput,
  redemption: PromotionRedemptionRecord | null,
): RideRecord {
  if (current == null || current.passengerId !== input.expectedRide.passengerId) {
    throw new PromotionRepositoryError('PROMOTION_NOT_FOUND', 'Corrida não encontrada.');
  }
  if (current.state !== 'AWAITING_PAYMENT' || current.paymentStatus !== 'created') {
    throw new PromotionRepositoryError(
      'PROMOTION_REFERENCE_CONFLICT',
      'A corrida não permite mais alterar o cupom.',
    );
  }
  if (current.promotion == null) return current;
  if (
    current.promotion.applicationId !== input.expectedRide.promotion?.applicationId ||
    current.updatedAt !== input.expectedRide.updatedAt ||
    redemption == null || redemption.status !== 'reserved' ||
    redemption.rideId !== current.id || redemption.passengerId !== current.passengerId
  ) {
    throw new PromotionRepositoryError(
      'PROMOTION_REFERENCE_CONFLICT',
      'A reserva do cupom mudou. Atualize a corrida antes de tentar novamente.',
    );
  }
  const { promotion, ...withoutPromotion } = current;
  return {
    ...withoutPromotion,
    quote: structuredClone(promotion.originalQuote),
    updatedAt: input.updatedAt,
  };
}

export interface PromotionRepository {
  listCampaigns(): Promise<PromotionCampaignRecord[]>;
  findCampaignById(id: string): Promise<PromotionCampaignRecord | null>;
  findCampaignByCode(code: string): Promise<PromotionCampaignRecord | null>;
  createCampaign(
    record: PromotionCampaignRecord,
  ): Promise<PromotionCampaignRecord>;
  setCampaignEnabled(
    id: string,
    enabled: boolean,
    updatedAt: string,
  ): Promise<PromotionCampaignRecord>;

  getPreference(
    passengerId: string,
  ): Promise<PassengerPromotionPreferenceRecord | null>;
  savePreference(
    preference: PassengerPromotionPreferenceRecord,
  ): Promise<PassengerPromotionPreferenceRecord>;
  clearPreference(passengerId: string): Promise<void>;

  findRedemptionById(
    id: string,
  ): Promise<PromotionRedemptionRecord | null>;
  findRedemptionByRideId(
    rideId: string,
  ): Promise<PromotionRedemptionRecord | null>;
  findRedemptionByReferenceKey(
    referenceKey: string,
  ): Promise<PromotionRedemptionRecord | null>;
  reserveRedemption(
    input: ReservePromotionRedemptionInput,
  ): Promise<PromotionRedemptionRecord>;
  removeFromRide(input: RemoveRidePromotionInput): Promise<RideRecord>;
  retainPaidReservation(input: RetainPaidPromotionInput): Promise<PromotionRedemptionRecord>;
  setRedemptionStatus(
    id: string,
    status: PromotionRedemptionStatus,
    updatedAt: string,
  ): Promise<PromotionRedemptionRecord>;
  countRedeemed(campaignId: string): Promise<number>;
}

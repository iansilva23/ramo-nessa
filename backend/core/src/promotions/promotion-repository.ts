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

  findRedemptionByRideId(
    rideId: string,
  ): Promise<PromotionRedemptionRecord | null>;
  findRedemptionByReferenceKey(
    referenceKey: string,
  ): Promise<PromotionRedemptionRecord | null>;
  reserveRedemption(
    input: ReservePromotionRedemptionInput,
  ): Promise<PromotionRedemptionRecord>;
  setRedemptionStatus(
    id: string,
    status: PromotionRedemptionStatus,
    updatedAt: string,
  ): Promise<PromotionRedemptionRecord>;
  countRedeemed(campaignId: string): Promise<number>;
}

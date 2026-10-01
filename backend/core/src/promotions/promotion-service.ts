import { createHash, randomUUID } from 'node:crypto';

import {
  isDriverPaymentHoldExpired,
  isRidePreparedForPayment,
  type RideQuoteSnapshot,
  type RideRecord,
} from '../rides/ride.js';
import type { RideRepository } from '../rides/ride-repository.js';
import type { FinanceRepository } from '../payments/finance-repository.js';
import type { PaymentRecord } from '../payments/payment.js';
import {
  PROMOTION_CATEGORIES,
  PROMOTION_KINDS,
  PromotionRepositoryError,
  type PassengerPromotionPreferenceRecord,
  type PromotionCampaignRecord,
  type PromotionCategory,
  type PromotionKind,
  type PromotionRedemptionRecord,
  type PromotionRepository,
} from './promotion-repository.js';

export interface RidePromotionSnapshot {
  campaignId: string;
  applicationId: string;
  code: string;
  name: string;
  kind: Exclude<PromotionKind, 'wallet_credit'>;
  normalTotalCents: number;
  discountCents: number;
  passengerPayableCents: number;
  driverEarningsCents: number;
  originalQuote: RideQuoteSnapshot;
}

export class PromotionError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PROMOTION_CODE'
      | 'INVALID_PROMOTION_CAMPAIGN'
      | 'PROMOTION_NOT_FOUND'
      | 'PROMOTION_NOT_ACTIVE'
      | 'PROMOTION_NOT_ELIGIBLE'
      | 'PROMOTION_NOT_BENEFICIAL'
      | 'PROMOTION_RIDE_STATE_INVALID'
      | 'PROMOTION_REQUIRES_DEVICE'
      | 'PROMOTION_WALLET_ONLY',
    message: string,
  ) {
    super(message);
    this.name = 'PromotionError';
  }
}

export function normalizePromotionCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (
    code.length < 3 ||
    code.length > 32 ||
    !/^[A-Z0-9_-]+$/.test(code)
  ) {
    throw new PromotionError(
      'INVALID_PROMOTION_CODE',
      'Cupom deve ter de 3 a 32 caracteres, usando letras, números, _ ou -.',
    );
  }
  return code;
}

export function promotionDeviceHash(clientInstanceId: string): string {
  const value = clientInstanceId.trim();
  if (
    value.length < 32 ||
    value.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new PromotionError(
      'PROMOTION_REQUIRES_DEVICE',
      'Não foi possível validar este aparelho para o cupom.',
    );
  }
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function positiveInt(
  value: number | undefined,
  field: string,
  max = 100000000,
): number | undefined {
  if (value == null) return undefined;
  if (!Number.isInteger(value) || value <= 0 || value > max) {
    throw new PromotionError(
      'INVALID_PROMOTION_CAMPAIGN',
      `${field} é inválido.`,
    );
  }
  return value;
}

function optionalInstant(
  value: string | undefined,
  field: string,
): string | undefined {
  if (value == null || !value.trim()) return undefined;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new PromotionError(
      'INVALID_PROMOTION_CAMPAIGN',
      `${field} deve ser uma data válida.`,
    );
  }
  return new Date(ms).toISOString();
}

export function createPromotionCampaignRecord(input: {
  code: string;
  name: string;
  kind: PromotionKind;
  valueCents?: number;
  percentBps?: number;
  maxDiscountCents?: number;
  fixedDriverFareCents?: number;
  categories?: PromotionCategory[];
  maxRedemptions: number;
  perPassengerLimit?: number;
  perDeviceLimit?: number;
  startsAt?: string;
  endsAt?: string;
  enabled?: boolean;
  now?: Date;
}): PromotionCampaignRecord {
  const code = normalizePromotionCode(input.code);
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 80) {
    throw new PromotionError(
      'INVALID_PROMOTION_CAMPAIGN',
      'Nome da campanha deve ter entre 3 e 80 caracteres.',
    );
  }
  if (!PROMOTION_KINDS.includes(input.kind)) {
    throw new PromotionError(
      'INVALID_PROMOTION_CAMPAIGN',
      'Tipo de cupom inválido.',
    );
  }

  const categories = [...new Set(input.categories ?? [])];
  if (
    categories.some(
      (item) => !PROMOTION_CATEGORIES.includes(item),
    )
  ) {
    throw new PromotionError(
      'INVALID_PROMOTION_CAMPAIGN',
      'Categoria promocional inválida.',
    );
  }

  const valueCents = positiveInt(input.valueCents, 'valueCents');
  const percentBps = positiveInt(input.percentBps, 'percentBps', 10000);
  const maxDiscountCents = positiveInt(
    input.maxDiscountCents,
    'maxDiscountCents',
  );
  const fixedDriverFareCents = positiveInt(
    input.fixedDriverFareCents,
    'fixedDriverFareCents',
  );
  if (
    (input.kind === 'wallet_credit' ||
      input.kind === 'fixed_discount') &&
    valueCents == null
  ) {
    throw new PromotionError(
      'INVALID_PROMOTION_CAMPAIGN',
      'Este tipo de cupom exige um valor em reais.',
    );
  }
  if (input.kind === 'percent_discount' && percentBps == null) {
    throw new PromotionError(
      'INVALID_PROMOTION_CAMPAIGN',
      'Cupom percentual exige um percentual.',
    );
  }
  if (
    input.kind === 'fixed_driver_fare' &&
    fixedDriverFareCents == null
  ) {
    throw new PromotionError(
      'INVALID_PROMOTION_CAMPAIGN',
      'Tarifa promocional exige o valor líquido do motorista.',
    );
  }

  const maxRedemptions =
    positiveInt(input.maxRedemptions, 'maxRedemptions', 1000000)!;
  const perPassengerLimit =
    positiveInt(
      input.perPassengerLimit ?? 1,
      'perPassengerLimit',
      1000,
    )!;
  const perDeviceLimit =
    positiveInt(
      input.perDeviceLimit ?? 1,
      'perDeviceLimit',
      1000,
    )!;
  const startsAt = optionalInstant(input.startsAt, 'startsAt');
  const endsAt = optionalInstant(input.endsAt, 'endsAt');
  if (
    startsAt != null &&
    endsAt != null &&
    Date.parse(endsAt) <= Date.parse(startsAt)
  ) {
    throw new PromotionError(
      'INVALID_PROMOTION_CAMPAIGN',
      'Fim da campanha deve ser posterior ao início.',
    );
  }

  const instant = (input.now ?? new Date()).toISOString();
  return {
    id: randomUUID(),
    code,
    name,
    kind: input.kind,
    ...(valueCents == null ? {} : { valueCents }),
    ...(percentBps == null ? {} : { percentBps }),
    ...(maxDiscountCents == null ? {} : { maxDiscountCents }),
    ...(fixedDriverFareCents == null
      ? {}
      : { fixedDriverFareCents }),
    categories,
    maxRedemptions,
    perPassengerLimit,
    perDeviceLimit,
    ...(startsAt == null ? {} : { startsAt }),
    ...(endsAt == null ? {} : { endsAt }),
    enabled: input.enabled === true,
    createdAt: instant,
    updatedAt: instant,
  };
}

export function publicPromotionCampaignView(
  campaign: PromotionCampaignRecord,
) {
  return {
    id: campaign.id,
    code: campaign.code,
    name: campaign.name,
    kind: campaign.kind,
    ...(campaign.valueCents == null
      ? {}
      : { valueCents: campaign.valueCents }),
    ...(campaign.percentBps == null
      ? {}
      : { percentBps: campaign.percentBps }),
    ...(campaign.maxDiscountCents == null
      ? {}
      : { maxDiscountCents: campaign.maxDiscountCents }),
    ...(campaign.fixedDriverFareCents == null
      ? {}
      : { fixedDriverFareCents: campaign.fixedDriverFareCents }),
    categories: campaign.categories,
    startsAt: campaign.startsAt ?? null,
    endsAt: campaign.endsAt ?? null,
  };
}

function assertCampaignActive(
  campaign: PromotionCampaignRecord,
  now: Date,
): void {
  const time = now.getTime();
  if (
    !campaign.enabled ||
    (campaign.startsAt != null &&
      Date.parse(campaign.startsAt) > time) ||
    (campaign.endsAt != null &&
      Date.parse(campaign.endsAt) <= time)
  ) {
    throw new PromotionError(
      'PROMOTION_NOT_ACTIVE',
      'Este cupom não está ativo neste momento.',
    );
  }
}

export async function savePassengerPromotionPreference(input: {
  promotions: PromotionRepository;
  passengerId: string;
  clientInstanceId: string;
  code: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const code = normalizePromotionCode(input.code);
  const campaign = await input.promotions.findCampaignByCode(code);
  if (campaign == null) {
    throw new PromotionError(
      'PROMOTION_NOT_FOUND',
      'Cupom não encontrado.',
    );
  }
  assertCampaignActive(campaign, now);
  const deviceHash = promotionDeviceHash(input.clientInstanceId);
  const updatedAt = now.toISOString();

  if (campaign.kind !== 'wallet_credit') {
    const preference: PassengerPromotionPreferenceRecord = {
      passengerId: input.passengerId,
      campaignId: campaign.id,
      deviceHash,
      updatedAt,
    };
    await input.promotions.savePreference(preference);
  }

  return {
    campaign: publicPromotionCampaignView(campaign),
    updatedAt,
  };
}

export async function passengerPromotionPreference(input: {
  promotions: PromotionRepository;
  passengerId: string;
  now?: Date;
}) {
  const preference = await input.promotions.getPreference(
    input.passengerId,
  );
  if (preference == null) return null;
  const campaign = await input.promotions.findCampaignById(
    preference.campaignId,
  );
  if (campaign == null) return null;
  try {
    assertCampaignActive(campaign, input.now ?? new Date());
  } catch {
    return null;
  }
  return {
    campaign: publicPromotionCampaignView(campaign),
    updatedAt: preference.updatedAt,
  };
}

function categoryAllowed(
  campaign: PromotionCampaignRecord,
  ride: RideRecord,
): boolean {
  return (
    campaign.categories.length === 0 ||
    campaign.categories.includes(
      ride.category as PromotionCategory,
    )
  );
}

function promotionValues(
  campaign: PromotionCampaignRecord,
  ride: RideRecord,
): {
  discountCents: number;
  passengerPayableCents: number;
  driverEarningsCents: number;
} {
  const normalTotal = ride.quote.totalAmountCents;
  if (campaign.kind === 'wallet_credit') {
    throw new PromotionError(
      'PROMOTION_WALLET_ONLY',
      'Este cupom adiciona crédito à carteira e não altera uma corrida diretamente.',
    );
  }
  if (!categoryAllowed(campaign, ride)) {
    throw new PromotionError(
      'PROMOTION_NOT_ELIGIBLE',
      'Este cupom não vale para a categoria escolhida.',
    );
  }

  if (campaign.kind === 'fixed_discount') {
    const discount = Math.min(campaign.valueCents!, normalTotal);
    return {
      discountCents: discount,
      passengerPayableCents: normalTotal - discount,
      driverEarningsCents: ride.quote.driverNetCents,
    };
  }

  if (campaign.kind === 'percent_discount') {
    const raw = Math.floor(
      (normalTotal * campaign.percentBps!) / 10000,
    );
    const discount = Math.min(
      normalTotal,
      campaign.maxDiscountCents == null
        ? raw
        : Math.min(raw, campaign.maxDiscountCents),
    );
    return {
      discountCents: discount,
      passengerPayableCents: normalTotal - discount,
      driverEarningsCents: ride.quote.driverNetCents,
    };
  }

  if (campaign.kind === 'free_ride') {
    return {
      discountCents: normalTotal,
      passengerPayableCents: 0,
      driverEarningsCents: ride.quote.driverNetCents,
    };
  }

  const fixed = campaign.fixedDriverFareCents!;
  if (fixed >= normalTotal) {
    throw new PromotionError(
      'PROMOTION_NOT_BENEFICIAL',
      'A tarifa promocional precisa ser menor que a tarifa normal desta corrida.',
    );
  }
  return {
    discountCents: normalTotal - fixed,
    passengerPayableCents: fixed,
    driverEarningsCents: fixed,
  };
}

function restoreOriginalQuote(ride: RideRecord): RideRecord {
  const promotion = ride.promotion;
  if (promotion == null) return ride;
  const {
    promotion: _promotion,
    ...rideWithoutPromotion
  } = ride;
  return {
    ...rideWithoutPromotion,
    quote: structuredClone(promotion.originalQuote),
  };
}

export async function applyPromotionToRide(input: {
  promotions: PromotionRepository;
  rides: RideRepository;
  passengerId: string;
  clientInstanceId: string;
  rideId: string;
  code?: string;
  now?: Date;
}): Promise<RideRecord> {
  const now = input.now ?? new Date();
  let ride = await input.rides.findById(input.rideId);
  if (ride == null || ride.passengerId !== input.passengerId) {
    throw new PromotionError(
      'PROMOTION_NOT_FOUND',
      'Corrida não encontrada.',
    );
  }
  if (
    ride.state !== 'AWAITING_PAYMENT' ||
    ride.paymentStatus !== 'created'
  ) {
    throw new PromotionError(
      'PROMOTION_RIDE_STATE_INVALID',
      'Cupom só pode ser alterado antes do pagamento.',
    );
  }

  const deviceHash = promotionDeviceHash(input.clientInstanceId);
  let campaign: PromotionCampaignRecord | null = null;
  if (input.code != null && input.code.trim()) {
    campaign = await input.promotions.findCampaignByCode(
      normalizePromotionCode(input.code),
    );
  } else {
    const preference = await input.promotions.getPreference(
      input.passengerId,
    );
    if (preference != null) {
      campaign = await input.promotions.findCampaignById(
        preference.campaignId,
      );
    }
  }
  if (campaign == null) {
    throw new PromotionError(
      'PROMOTION_NOT_FOUND',
      'Cupom não encontrado.',
    );
  }
  assertCampaignActive(campaign, now);

  if (
    ride.promotion?.campaignId === campaign.id &&
    ride.promotion.code === campaign.code
  ) {
    return ride;
  }

  const previousRedemption =
    ride.promotion == null
      ? null
      : await input.promotions.findRedemptionById(
          ride.promotion.applicationId,
        );
  if (
    previousRedemption != null &&
    previousRedemption.status !== 'reserved'
  ) {
    throw new PromotionError(
      'PROMOTION_RIDE_STATE_INVALID',
      'A reserva do cupom atual não pode mais ser substituída.',
    );
  }
  ride = restoreOriginalQuote(ride);

  const values = promotionValues(campaign, ride);
  const applicationId = randomUUID();
  const instant = now.toISOString();
  const redemption: PromotionRedemptionRecord = {
    id: applicationId,
    campaignId: campaign.id,
    passengerId: input.passengerId,
    deviceHash,
    rideId: ride.id,
    referenceKey: `ride:${ride.id}:${applicationId}`,
    status: 'reserved',
    normalTotalCents: ride.quote.totalAmountCents,
    discountCents: values.discountCents,
    passengerPayableCents: values.passengerPayableCents,
    driverEarningsCents: values.driverEarningsCents,
    ...(ride.driverHoldExpiresAt == null
      ? {}
      : { expiresAt: ride.driverHoldExpiresAt }),
    createdAt: instant,
    updatedAt: instant,
  };

  let reserved: PromotionRedemptionRecord;
  try {
    reserved = await input.promotions.reserveRedemption({
      redemption,
      maxRedemptions: campaign.maxRedemptions,
      perPassengerLimit: campaign.perPassengerLimit,
      perDeviceLimit: campaign.perDeviceLimit,
      now: instant,
      ...(previousRedemption == null
        ? {}
        : { replaceRedemptionId: previousRedemption.id }),
    });
  } catch (error) {
    if (error instanceof PromotionRepositoryError) throw error;
    throw error;
  }

  const originalQuote = structuredClone(ride.quote);
  const promotion: RidePromotionSnapshot = {
    campaignId: campaign.id,
    applicationId: reserved.id,
    code: campaign.code,
    name: campaign.name,
    kind: campaign.kind as RidePromotionSnapshot['kind'],
    normalTotalCents: originalQuote.totalAmountCents,
    discountCents: values.discountCents,
    passengerPayableCents: values.passengerPayableCents,
    driverEarningsCents: values.driverEarningsCents,
    originalQuote,
  };

  const promotedQuote =
    campaign.kind === 'fixed_driver_fare'
      ? {
          ...originalQuote,
          ruleId: `promotion:${campaign.id}`,
          baseAmountCents: values.driverEarningsCents,
          pickupCompensationCents: 0,
          totalAmountCents: values.driverEarningsCents,
          platformCommissionCents: 0,
          driverNetCents: values.driverEarningsCents,
        }
      : originalQuote;

  try {
    return await input.rides.save({
      ...ride,
      quote: promotedQuote,
      promotion,
      updatedAt: instant,
    });
  } catch (error) {
    const rollbackInstant = new Date().toISOString();
    await input.promotions.setRedemptionStatus(
      reserved.id,
      'released',
      rollbackInstant,
    );
    if (previousRedemption?.status === 'reserved') {
      await input.promotions.setRedemptionStatus(
        previousRedemption.id,
        'reserved',
        rollbackInstant,
      );
    }
    throw error;
  }
}

export async function removePromotionFromRide(input: {
  promotions: PromotionRepository;
  rides: RideRepository;
  passengerId: string;
  rideId: string;
  now?: Date;
}): Promise<RideRecord> {
  const ride = await input.rides.findById(input.rideId);
  if (ride == null || ride.passengerId !== input.passengerId) {
    throw new PromotionError(
      'PROMOTION_NOT_FOUND',
      'Corrida não encontrada.',
    );
  }
  if (
    ride.state !== 'AWAITING_PAYMENT' ||
    ride.paymentStatus !== 'created'
  ) {
    throw new PromotionError(
      'PROMOTION_RIDE_STATE_INVALID',
      'Cupom só pode ser removido antes do pagamento.',
    );
  }
  return input.promotions.removeFromRide({
    rides: input.rides,
    expectedRide: ride,
    updatedAt: (input.now ?? new Date()).toISOString(),
  });
}

export async function redeemWalletPromotionCode(input: {
  promotions: PromotionRepository;
  finance: FinanceRepository;
  passengerId: string;
  clientInstanceId: string;
  code: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const code = normalizePromotionCode(input.code);
  const campaign = await input.promotions.findCampaignByCode(code);
  if (campaign == null) {
    throw new PromotionError(
      'PROMOTION_NOT_FOUND',
      'Cupom não encontrado.',
    );
  }
  assertCampaignActive(campaign, now);
  if (campaign.kind !== 'wallet_credit') {
    throw new PromotionError(
      'PROMOTION_NOT_ELIGIBLE',
      'Este cupom é aplicado diretamente em uma corrida.',
    );
  }

  const deviceHash = promotionDeviceHash(input.clientInstanceId);
  const instant = now.toISOString();
  const redemption: PromotionRedemptionRecord = {
    id: randomUUID(),
    campaignId: campaign.id,
    passengerId: input.passengerId,
    deviceHash,
    referenceKey:
      `wallet:${campaign.id}:${input.passengerId}:${deviceHash}`,
    status: 'reserved',
    normalTotalCents: 0,
    discountCents: campaign.valueCents!,
    passengerPayableCents: 0,
    driverEarningsCents: 0,
    createdAt: instant,
    updatedAt: instant,
  };

  const reserved = await input.promotions.reserveRedemption({
    redemption,
    maxRedemptions: campaign.maxRedemptions,
    perPassengerLimit: campaign.perPassengerLimit,
    perDeviceLimit: campaign.perDeviceLimit,
    now: instant,
  });

  if (reserved.status === 'released') {
    throw new PromotionError(
      'PROMOTION_NOT_ACTIVE',
      'Este uso promocional foi liberado e não pode ser creditado novamente.',
    );
  }
  // A financial write can succeed before its response/status write fails. Keep the
  // reservation counting toward limits; a retry uses the same ledger reference.
  await input.finance.grantWalletPromotion({
    passengerId: input.passengerId,
    applicationId: reserved.id,
    amountCents: campaign.valueCents!,
    grantedAt: now,
  });
  await input.promotions.setRedemptionStatus(reserved.id, 'redeemed', instant);

  return {
    campaign: publicPromotionCampaignView(campaign),
    walletCreditCents: campaign.valueCents!,
    walletBalanceCents: await input.finance.getAccountBalanceCents(
      `passenger:${input.passengerId}:wallet`,
    ),
  };
}

export async function fundRidePromotion(input: {
  finance: FinanceRepository;
  promotions: PromotionRepository;
  ride: RideRecord;
  now?: Date;
}): Promise<void> {
  const promotion = input.ride.promotion;
  if (promotion == null || input.ride.state === 'CANCELLED_BY_PASSENGER' ||
      input.ride.state === 'CANCELLED_BY_DRIVER' || input.ride.state === 'CANCELLED_BY_ADMIN' ||
      input.ride.state === 'REFUND_PENDING' || input.ride.state === 'REFUNDED') {
    return;
  }
  await input.promotions.retainPaidReservation({
    redemptionId: promotion.applicationId,
    campaignId: promotion.campaignId,
    rideId: input.ride.id,
    passengerId: input.ride.passengerId,
    updatedAt: (input.now ?? new Date()).toISOString(),
  });
  if (promotion.kind === 'fixed_driver_fare') return;
  if (promotion.discountCents <= 0) return;
  await input.finance.fundRidePromotion({
    rideId: input.ride.id,
    applicationId: promotion.applicationId,
    amountCents: promotion.discountCents,
    ...(input.now == null ? {} : { fundedAt: input.now }),
  });
}

export async function redeemRidePromotion(input: {
  promotions: PromotionRepository;
  ride: RideRecord;
  now?: Date;
}): Promise<void> {
  const promotion = input.ride.promotion;
  if (promotion == null) return;
  const redemption = await input.promotions.findRedemptionById(
    promotion.applicationId,
  );
  if (redemption == null || redemption.status === 'redeemed') return;
  if (redemption.status !== 'reserved') {
    throw new PromotionError(
      'PROMOTION_NOT_ACTIVE',
      'A reserva deste cupom não está mais ativa.',
    );
  }
  await input.promotions.setRedemptionStatus(
    redemption.id,
    'redeemed',
    (input.now ?? new Date()).toISOString(),
  );
}

export async function releaseRidePromotionReservation(input: {
  promotions: PromotionRepository;
  ride: RideRecord;
  now?: Date;
}): Promise<void> {
  const promotion = input.ride.promotion;
  if (promotion == null) return;
  const redemption = await input.promotions.findRedemptionById(
    promotion.applicationId,
  );
  if (redemption == null || redemption.status === 'released') return;
  if (redemption.status === 'redeemed') {
    return;
  }
  await input.promotions.setRedemptionStatus(
    redemption.id,
    'released',
    (input.now ?? new Date()).toISOString(),
  );
}

export async function releaseFundedRidePromotion(input: {
  promotions: PromotionRepository;
  finance: FinanceRepository;
  ride: RideRecord;
  now?: Date;
}): Promise<void> {
  const promotion = input.ride.promotion;
  if (promotion == null) return;
  const redemption = await input.promotions.findRedemptionById(
    promotion.applicationId,
  );
  if (redemption == null || redemption.status === 'released') return;

  if (
    promotion.kind !== 'fixed_driver_fare' &&
    promotion.discountCents > 0
  ) {
    await input.finance.reverseRidePromotion({
      rideId: input.ride.id,
      applicationId: promotion.applicationId,
      amountCents: promotion.discountCents,
      ...(input.now == null ? {} : { reversedAt: input.now }),
    });
  }
  await input.promotions.setRedemptionStatus(
    redemption.id,
    'released',
    (input.now ?? new Date()).toISOString(),
  );
}

export async function createFullyPromotionalPayment(input: {
  finance: FinanceRepository;
  ride: RideRecord;
  now?: Date;
}): Promise<PaymentRecord> {
  if (
    input.ride.promotion == null ||
    passengerPayableCents(input.ride) !== 0
  ) {
    throw new PromotionError(
      'PROMOTION_NOT_ELIGIBLE',
      'Esta corrida ainda possui valor a pagar.',
    );
  }
  const key =
    `promotion-${input.ride.promotion.applicationId}`;
  const existing =
    await input.finance.findPaymentByIdempotencyKey(key);
  if (existing != null) return existing;

  const now = input.now ?? new Date();
  if (
    input.ride.state !== 'AWAITING_PAYMENT' ||
    input.ride.paymentStatus !== 'created' ||
    !isRidePreparedForPayment(input.ride)
  ) {
    throw new PromotionError(
      'PROMOTION_RIDE_STATE_INVALID',
      'A corrida não está pronta para confirmar o benefício promocional.',
    );
  }
  if (isDriverPaymentHoldExpired(input.ride, now)) {
    throw new PromotionError(
      'PROMOTION_RIDE_STATE_INVALID',
      'A reserva do motorista expirou. Prepare a corrida novamente.',
    );
  }

  const instant = now.toISOString();
  return input.finance.createPayment({
    id: randomUUID(),
    rideId: input.ride.id,
    method: 'promotion',
    processor: 'internal-promotion',
    status: 'paid',
    amountCents: 0,
    idempotencyKey: key,
    createdAt: instant,
    updatedAt: instant,
  });
}

export function passengerPayableCents(ride: RideRecord): number {
  return ride.promotion?.passengerPayableCents ??
    ride.quote.totalAmountCents;
}

export function promotionSubsidyCents(ride: RideRecord): number {
  if (ride.promotion == null) return 0;
  if (ride.promotion.kind === 'fixed_driver_fare') return 0;
  return ride.promotion.discountCents;
}

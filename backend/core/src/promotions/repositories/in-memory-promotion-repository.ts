import {
  PromotionRepositoryError,
  prepareRidePromotionRemoval,
  preparePaidPromotionReservation,
  type PassengerPromotionPreferenceRecord,
  type PromotionCampaignRecord,
  type PromotionRedemptionRecord,
  type PromotionRedemptionStatus,
  type PromotionRepository,
  type ReservePromotionRedemptionInput,
  type RemoveRidePromotionInput,
  type RetainPaidPromotionInput,
} from '../promotion-repository.js';
import type { RideRecord } from '../../rides/ride.js';

function activeForLimit(
  item: PromotionRedemptionRecord,
  now: string,
): boolean {
  if (item.status === 'redeemed') return true;
  if (item.status !== 'reserved') return false;
  return item.expiresAt == null || item.expiresAt > now;
}

export class InMemoryPromotionRepository
  implements PromotionRepository {
  private readonly campaigns = new Map<string, PromotionCampaignRecord>();
  private readonly campaignByCode = new Map<string, string>();
  private readonly preferences =
    new Map<string, PassengerPromotionPreferenceRecord>();
  private readonly redemptions =
    new Map<string, PromotionRedemptionRecord>();
  private readonly redemptionByReference = new Map<string, string>();
  private readonly redemptionByRide = new Map<string, string>();

  async listCampaigns(): Promise<PromotionCampaignRecord[]> {
    return [...this.campaigns.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => structuredClone(item));
  }

  async findCampaignById(
    id: string,
  ): Promise<PromotionCampaignRecord | null> {
    const item = this.campaigns.get(id);
    return item == null ? null : structuredClone(item);
  }

  async findCampaignByCode(
    code: string,
  ): Promise<PromotionCampaignRecord | null> {
    const id = this.campaignByCode.get(code);
    return id == null ? null : this.findCampaignById(id);
  }

  async createCampaign(
    record: PromotionCampaignRecord,
  ): Promise<PromotionCampaignRecord> {
    if (
      this.campaigns.has(record.id) ||
      this.campaignByCode.has(record.code)
    ) {
      throw new PromotionRepositoryError(
        'PROMOTION_REFERENCE_CONFLICT',
        'Código promocional já existe.',
      );
    }
    this.campaigns.set(record.id, structuredClone(record));
    this.campaignByCode.set(record.code, record.id);
    return structuredClone(record);
  }

  async setCampaignEnabled(
    id: string,
    enabled: boolean,
    updatedAt: string,
  ): Promise<PromotionCampaignRecord> {
    const current = this.campaigns.get(id);
    if (current == null) {
      throw new PromotionRepositoryError(
        'PROMOTION_NOT_FOUND',
        'Campanha não encontrada.',
      );
    }
    const next = { ...current, enabled, updatedAt };
    this.campaigns.set(id, structuredClone(next));
    return structuredClone(next);
  }

  async updateCampaignPresentation(id: string, presentation: PromotionCampaignRecord['driverPresentation'], expectedUpdatedAt: string, updatedAt: string): Promise<PromotionCampaignRecord> {
    const current = this.campaigns.get(id);
    if (current == null) throw new PromotionRepositoryError('PROMOTION_NOT_FOUND', 'Campanha não encontrada.');
    if (current.updatedAt !== expectedUpdatedAt) throw new PromotionRepositoryError('PROMOTION_REFERENCE_CONFLICT', 'A campanha mudou. Atualize a lista antes de salvar.');
    const {driverPresentation: _old, ...rest} = current;
    const next = {...rest, ...(presentation == null ? {} : {driverPresentation: structuredClone(presentation)}), updatedAt};
    this.campaigns.set(id, next);
    return structuredClone(next);
  }

  async getPreference(
    passengerId: string,
  ): Promise<PassengerPromotionPreferenceRecord | null> {
    const item = this.preferences.get(passengerId);
    return item == null ? null : structuredClone(item);
  }

  async savePreference(
    preference: PassengerPromotionPreferenceRecord,
  ): Promise<PassengerPromotionPreferenceRecord> {
    this.preferences.set(
      preference.passengerId,
      structuredClone(preference),
    );
    return structuredClone(preference);
  }

  async clearPreference(passengerId: string): Promise<void> {
    this.preferences.delete(passengerId);
  }

  async findRedemptionById(
    id: string,
  ): Promise<PromotionRedemptionRecord | null> {
    const item = this.redemptions.get(id);
    return item == null ? null : structuredClone(item);
  }

  async findRedemptionByRideId(
    rideId: string,
  ): Promise<PromotionRedemptionRecord | null> {
    const id = this.redemptionByRide.get(rideId);
    const item = id == null ? null : this.redemptions.get(id);
    return item == null ? null : structuredClone(item);
  }

  async findRedemptionByReferenceKey(
    referenceKey: string,
  ): Promise<PromotionRedemptionRecord | null> {
    const id = this.redemptionByReference.get(referenceKey);
    const item = id == null ? null : this.redemptions.get(id);
    return item == null ? null : structuredClone(item);
  }

  async reserveRedemption(
    input: ReservePromotionRedemptionInput,
  ): Promise<PromotionRedemptionRecord> {
    const existing = await this.findRedemptionByReferenceKey(
      input.redemption.referenceKey,
    );
    if (existing != null) {
      if (
        existing.campaignId !== input.redemption.campaignId ||
        existing.passengerId !== input.redemption.passengerId ||
        existing.deviceHash !== input.redemption.deviceHash
      ) {
        throw new PromotionRepositoryError(
          'PROMOTION_REFERENCE_CONFLICT',
          'Reserva promocional já pertence a outro uso.',
        );
      }
      return existing;
    }

    const replacement =
      input.replaceRedemptionId == null
        ? null
        : this.redemptions.get(input.replaceRedemptionId) ?? null;
    if (input.replaceRedemptionId != null) {
      if (
        replacement == null ||
        replacement.status !== 'reserved' ||
        replacement.rideId !== input.redemption.rideId ||
        replacement.passengerId !== input.redemption.passengerId
      ) {
        throw new PromotionRepositoryError(
          'PROMOTION_REFERENCE_CONFLICT',
          'A reserva anterior da corrida não pode ser substituída.',
        );
      }
    }

    const active = [...this.redemptions.values()].filter(
      (item) =>
        item.id !== replacement?.id &&
        item.campaignId === input.redemption.campaignId &&
        activeForLimit(item, input.now),
    );
    const campaign = this.campaigns.get(input.redemption.campaignId);
    if (campaign?.budgetCents != null && campaign.kind !== 'fixed_driver_fare' &&
        active.reduce((total, item) => total + item.discountCents, 0) + input.redemption.discountCents > campaign.budgetCents) {
      throw new PromotionRepositoryError('PROMOTION_BUDGET_REACHED', 'O orçamento deste cupom foi atingido.');
    }
    if (active.length >= input.maxRedemptions) {
      throw new PromotionRepositoryError(
        'PROMOTION_LIMIT_REACHED',
        'O limite total deste cupom foi atingido.',
      );
    }
    if (
      active.filter(
        (item) => item.passengerId === input.redemption.passengerId,
      ).length >= input.perPassengerLimit
    ) {
      throw new PromotionRepositoryError(
        'PROMOTION_PASSENGER_LIMIT_REACHED',
        'Este passageiro já atingiu o limite deste cupom.',
      );
    }
    if (
      active.filter(
        (item) => item.deviceHash === input.redemption.deviceHash,
      ).length >= input.perDeviceLimit
    ) {
      throw new PromotionRepositoryError(
        'PROMOTION_DEVICE_LIMIT_REACHED',
        'Este aparelho já atingiu o limite deste cupom.',
      );
    }

    if (replacement != null) {
      this.redemptions.set(
        replacement.id,
        structuredClone({
          ...replacement,
          status: 'released',
          updatedAt: input.now,
        }),
      );
    }

    const item = structuredClone(input.redemption);
    this.redemptions.set(item.id, item);
    this.redemptionByReference.set(item.referenceKey, item.id);
    if (item.rideId != null) {
      this.redemptionByRide.set(item.rideId, item.id);
    }
    return structuredClone(item);
  }

  async removeFromRide(input: RemoveRidePromotionInput): Promise<RideRecord> {
    const current = await input.rides.findById(input.expectedRide.id);
    const redemption = current?.promotion == null
      ? null
      : this.redemptions.get(current.promotion.applicationId) ?? null;
    const restored = prepareRidePromotionRemoval(current, input, redemption);
    if (current?.promotion == null) return restored;
    // Save first: a rejected save must keep the reservation counting toward limits.
    const saved = await input.rides.save(restored);
    this.redemptions.set(redemption!.id, {
      ...redemption!, status: 'released', updatedAt: input.updatedAt,
    });
    return saved;
  }

  async retainPaidReservation(input: RetainPaidPromotionInput): Promise<PromotionRedemptionRecord> {
    const retained = preparePaidPromotionReservation(
      this.redemptions.get(input.redemptionId) ?? null, input,
    );
    this.redemptions.set(retained.id, structuredClone(retained));
    return structuredClone(retained);
  }

  async setRedemptionStatus(
    id: string,
    status: PromotionRedemptionStatus,
    updatedAt: string,
  ): Promise<PromotionRedemptionRecord> {
    const current = this.redemptions.get(id);
    if (current == null) {
      throw new PromotionRepositoryError(
        'PROMOTION_NOT_FOUND',
        'Uso promocional não encontrado.',
      );
    }
    const campaign = this.campaigns.get(current.campaignId);
    const next = { ...current, status, updatedAt };
    if (campaign?.budgetCents != null && campaign.kind !== 'fixed_driver_fare' && activeForLimit(next, updatedAt)) {
      const committed = [...this.redemptions.values()].filter(item => item.id !== id && item.campaignId === current.campaignId && activeForLimit(item, updatedAt)).reduce((sum, item) => sum + item.discountCents, 0);
      if (committed + current.discountCents > campaign.budgetCents) throw new PromotionRepositoryError('PROMOTION_BUDGET_REACHED', 'O orçamento deste cupom foi atingido.');
    }
    this.redemptions.set(id, structuredClone(next));
    return structuredClone(next);
  }

  async extendReservedExpiry(id: string, expiresAt: string, at: string): Promise<void> {
    const current = this.redemptions.get(id);
    if (current?.status !== 'reserved' || (current.expiresAt != null && Date.parse(current.expiresAt) <= Date.parse(at))) {
      throw new PromotionRepositoryError('PROMOTION_REFERENCE_CONFLICT', 'A reserva do cupom expirou. Peça uma nova corrida.');
    }
    this.redemptions.set(id, { ...current, expiresAt, updatedAt: at });
  }

  async countRedeemed(campaignId: string): Promise<number> {
    return [...this.redemptions.values()].filter(
      (item) =>
        item.campaignId === campaignId &&
        item.status === 'redeemed',
    ).length;
  }
}

import {
  PromotionRepositoryError,
  type PassengerPromotionPreferenceRecord,
  type PromotionCampaignRecord,
  type PromotionRedemptionRecord,
  type PromotionRedemptionStatus,
  type PromotionRepository,
  type ReservePromotionRedemptionInput,
} from '../promotion-repository.js';

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

    const active = [...this.redemptions.values()].filter(
      (item) =>
        item.campaignId === input.redemption.campaignId &&
        activeForLimit(item, input.now),
    );
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

    const item = structuredClone(input.redemption);
    this.redemptions.set(item.id, item);
    this.redemptionByReference.set(item.referenceKey, item.id);
    if (item.rideId != null) {
      this.redemptionByRide.set(item.rideId, item.id);
    }
    return structuredClone(item);
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
    const next = { ...current, status, updatedAt };
    this.redemptions.set(id, structuredClone(next));
    return structuredClone(next);
  }

  async countRedeemed(campaignId: string): Promise<number> {
    return [...this.redemptions.values()].filter(
      (item) =>
        item.campaignId === campaignId &&
        item.status === 'redeemed',
    ).length;
  }
}

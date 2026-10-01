import type {
  DriverBenefitBaseRecord,
  DriverBenefitCampaignRecord,
  DriverBenefitRepository,
  DriverBenefitSettingsRecord,
  DriverBenefitStatsRecord,
} from '../driver-benefit-repository.js';
import { DriverBenefitError, effectiveDriverBenefitStatus } from '../driver-benefit-service.js';

export class InMemoryDriverBenefitRepository
  implements DriverBenefitRepository
{
  private settings: DriverBenefitSettingsRecord = {
    enabled: false,
    updatedAt: '1970-01-01T00:00:00.000Z',
  };
  private readonly campaigns =
    new Map<string, DriverBenefitCampaignRecord>();
  private readonly bases =
    new Map<string, DriverBenefitBaseRecord>();
  private readonly stats =
    new Map<string, DriverBenefitStatsRecord[]>();
  private readonly finalizedStats = new Map<string, DriverBenefitStatsRecord[]>();

  async getSettings(): Promise<DriverBenefitSettingsRecord> {
    return structuredClone(this.settings);
  }

  async updateSettings(input: {
    enabled: boolean;
    updatedAt: string;
  }): Promise<DriverBenefitSettingsRecord> {
    this.settings = {
      enabled: input.enabled,
      updatedAt: input.updatedAt,
    };
    return structuredClone(this.settings);
  }

  async listCampaigns(): Promise<DriverBenefitCampaignRecord[]> {
    return [...this.campaigns.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((campaign) => structuredClone(campaign));
  }

  async findCampaign(
    id: string,
  ): Promise<DriverBenefitCampaignRecord | null> {
    const found = this.campaigns.get(id);
    return found == null ? null : structuredClone(found);
  }

  async createCampaign(
    campaign: DriverBenefitCampaignRecord,
  ): Promise<DriverBenefitCampaignRecord> {
    this.campaigns.set(campaign.id, structuredClone(campaign));
    return structuredClone(campaign);
  }

  async updateCampaign(
    campaign: DriverBenefitCampaignRecord,
    expectedUpdatedAt: string,
  ): Promise<DriverBenefitCampaignRecord> {
    if (this.campaigns.get(campaign.id)?.updatedAt !== expectedUpdatedAt) {
      throw new DriverBenefitError('DRIVER_BENEFIT_CONFLICT',
        'A campanha foi alterada por outro operador. Atualize antes de salvar.');
    }
    this.campaigns.set(campaign.id, structuredClone(campaign));
    return structuredClone(campaign);
  }

  async findDriverBase(
    driverId: string,
  ): Promise<DriverBenefitBaseRecord | null> {
    const found = this.bases.get(driverId);
    return found == null ? null : structuredClone(found);
  }

  async setDriverBase(
    base: DriverBenefitBaseRecord,
  ): Promise<DriverBenefitBaseRecord> {
    this.bases.set(base.driverId, structuredClone(base));
    return structuredClone(base);
  }

  async clearDriverBase(driverId: string): Promise<boolean> {
    return this.bases.delete(driverId);
  }

  async rankingStats(
    campaign: DriverBenefitCampaignRecord,
    now = new Date(),
  ): Promise<DriverBenefitStatsRecord[]> {
    const finalized = this.finalizedStats.get(campaign.id);
    if (finalized != null) return structuredClone(finalized);
    if (effectiveDriverBenefitStatus(campaign, now) === 'ended') {
      const stats = structuredClone(this.stats.get(campaign.id) ?? []);
      this.finalizedStats.set(campaign.id, stats);
      return structuredClone(stats);
    }
    return structuredClone(this.stats.get(campaign.id) ?? []);
  }

  setRankingStats(
    campaignId: string,
    stats: DriverBenefitStatsRecord[],
  ): void {
    this.stats.set(campaignId, structuredClone(stats));
  }
}

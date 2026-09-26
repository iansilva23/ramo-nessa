import type {
  AdminCommunicationsRepository,
  AdminNotificationCampaignRecord,
  AgencyPromotionRecord,
  AppReleasePolicyRecord,
  SocialLinksRecord,
} from '../admin-communications-repository.js';
import type { AuthSubjectType } from '../../auth/auth-session-repository.js';
import type { PushPlatform } from '../../notifications/push-device-repository.js';

function releaseKey(
  appKind: AuthSubjectType,
  platform: PushPlatform,
): string {
  return `${appKind}:${platform}`;
}

function defaultPolicies(): AppReleasePolicyRecord[] {
  const now = '2026-09-24T00:00:00.000Z';
  return [
    {
      appKind: 'passenger',
      platform: 'android',
      latestVersion: '0.1.0',
      latestBuild: 1,
      minimumBuild: 1,
      updateMessage: 'Existe uma nova versão do Ramo Nessa disponível.',
      updatedAt: now,
    },
    {
      appKind: 'passenger',
      platform: 'ios',
      latestVersion: '0.1.0',
      latestBuild: 1,
      minimumBuild: 1,
      updateMessage: 'Existe uma nova versão do Ramo Nessa disponível.',
      updatedAt: now,
    },
    {
      appKind: 'driver',
      platform: 'android',
      latestVersion: '0.1.0',
      latestBuild: 1,
      minimumBuild: 1,
      updateMessage:
        'Existe uma nova versão do Ramo Nessa Motorista disponível.',
      updatedAt: now,
    },
    {
      appKind: 'driver',
      platform: 'ios',
      latestVersion: '0.1.0',
      latestBuild: 1,
      minimumBuild: 1,
      updateMessage:
        'Existe uma nova versão do Ramo Nessa Motorista disponível.',
      updatedAt: now,
    },
  ];
}

export class InMemoryAdminCommunicationsRepository
  implements AdminCommunicationsRepository {
  private readonly campaigns =
    new Map<string, AdminNotificationCampaignRecord>();
  private readonly policies =
    new Map<string, AppReleasePolicyRecord>();
  private socialLinks: SocialLinksRecord = {
    updatedAt: '2026-09-24T00:00:00.000Z',
  };

  private promotion: AgencyPromotionRecord = {
    id: 'ramo-nessa-agencia',
    enabled: false,
    title: 'Ramo Nessa Agência',
    subtitle: 'Passeios e experiências em Jericoacoara',
    description:
      'Descubra passeios selecionados em Jericoacoara e região com atendimento da Ramo Nessa.',
    ctaLabel: 'Conhecer passeios',
    updatedAt: '2026-09-24T00:00:00.000Z',
  };

  constructor() {
    for (const policy of defaultPolicies()) {
      this.policies.set(
        releaseKey(policy.appKind, policy.platform),
        structuredClone(policy),
      );
    }
  }

  async createCampaign(
    record: AdminNotificationCampaignRecord,
  ): Promise<AdminNotificationCampaignRecord> {
    this.campaigns.set(record.id, structuredClone(record));
    return structuredClone(record);
  }

  async listCampaigns(
    limit: number,
  ): Promise<AdminNotificationCampaignRecord[]> {
    return [...this.campaigns.values()]
      .sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
      )
      .slice(0, Math.max(1, Math.min(100, Math.trunc(limit))))
      .map((record) => structuredClone(record));
  }

  async getReleasePolicy(
    appKind: AuthSubjectType,
    platform: PushPlatform,
  ): Promise<AppReleasePolicyRecord> {
    const record = this.policies.get(releaseKey(appKind, platform));
    if (record == null) {
      throw new Error('Política de versão não encontrada.');
    }
    return structuredClone(record);
  }

  async listReleasePolicies(): Promise<AppReleasePolicyRecord[]> {
    return [...this.policies.values()]
      .sort((a, b) =>
        a.appKind.localeCompare(b.appKind) ||
        a.platform.localeCompare(b.platform),
      )
      .map((record) => structuredClone(record));
  }

  async saveReleasePolicy(
    record: AppReleasePolicyRecord,
  ): Promise<AppReleasePolicyRecord> {
    this.policies.set(
      releaseKey(record.appKind, record.platform),
      structuredClone(record),
    );
    return structuredClone(record);
  }

  async getAgencyPromotion(): Promise<AgencyPromotionRecord> {
    return structuredClone(this.promotion);
  }

  async saveAgencyPromotion(
    record: AgencyPromotionRecord,
  ): Promise<AgencyPromotionRecord> {
    this.promotion = structuredClone(record);
    return structuredClone(this.promotion);
  }

  async getSocialLinks(): Promise<SocialLinksRecord> {
    return structuredClone(this.socialLinks);
  }

  async saveSocialLinks(
    record: SocialLinksRecord,
  ): Promise<SocialLinksRecord> {
    this.socialLinks = structuredClone(record);
    return structuredClone(this.socialLinks);
  }
}

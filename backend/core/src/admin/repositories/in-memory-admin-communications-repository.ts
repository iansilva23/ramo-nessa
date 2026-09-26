import type {
  AdminCommunicationsRepository,
  AdminNotificationCampaignRecord,
  AgencyPromotionRecord,
  AgencyTourCover,
  AgencyTourRecord,
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

function defaultTours(): AgencyTourRecord[] {
  const updatedAt = '2026-09-26T00:00:00.000Z';
  return [
    ['lado-leste', 10, 'Passeio Lado Leste', 'COMPARTILHADO'],
    ['lado-oeste', 20, 'Passeio Lado Oeste', 'COMPARTILHADO'],
    ['por-do-sol', 30, 'Passeio Pôr do Sol', 'EXPERIÊNCIA'],
    [
      'pedra-furada-bike-eletrica',
      40,
      'Pedra Furada de Bike Elétrica',
      'EXPERIÊNCIA',
    ],
    ['utv', 50, 'Passeio de UTV', 'PRIVATIVO'],
    ['madrinha', 60, 'Passeio Madrinha', 'EXPERIÊNCIA'],
    ['extremo-leste', 70, 'Passeio Extremo Leste', 'EXPERIÊNCIA'],
  ].map(([slug, sortOrder, title, badge]) => ({
    slug: String(slug),
    enabled: false,
    sortOrder: Number(sortOrder),
    title: String(title),
    badge: String(badge),
    shortDescription: 'Configure os detalhes deste passeio no painel ADM.',
    description:
      'Preencha no painel ADM as informações completas, roteiro, duração, preço e atendimento pelo WhatsApp.',
    highlights: [],
    included: [],
    excluded: [],
    priceLabel: 'A partir de',
    whatsappPhone: '',
    whatsappMessage: '',
    coverImageVersion: 0,
    updatedAt,
  }));
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
  private readonly tours = new Map<string, AgencyTourRecord>();
  private readonly tourCovers = new Map<string, AgencyTourCover>();
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
    for (const tour of defaultTours()) {
      this.tours.set(tour.slug, structuredClone(tour));
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

  async listTours(
    includeDisabled: boolean,
  ): Promise<AgencyTourRecord[]> {
    return [...this.tours.values()]
      .filter((tour) => includeDisabled || tour.enabled)
      .sort((a, b) =>
        a.sortOrder - b.sortOrder ||
        a.title.localeCompare(b.title) ||
        a.slug.localeCompare(b.slug),
      )
      .map((tour) => structuredClone(tour));
  }

  async getTour(slug: string): Promise<AgencyTourRecord | null> {
    const tour = this.tours.get(slug);
    return tour == null ? null : structuredClone(tour);
  }

  async saveTour(record: AgencyTourRecord): Promise<AgencyTourRecord> {
    const current = this.tours.get(record.slug);
    const next: AgencyTourRecord = {
      ...structuredClone(record),
      coverImageVersion:
        current?.coverImageVersion ?? record.coverImageVersion,
      ...(current?.coverImageMimeType == null
        ? {}
        : { coverImageMimeType: current.coverImageMimeType }),
    };
    this.tours.set(record.slug, next);
    return structuredClone(next);
  }

  async readTourCover(slug: string): Promise<AgencyTourCover | null> {
    const cover = this.tourCovers.get(slug);
    return cover == null ? null : structuredClone(cover);
  }

  async saveTourCover(input: {
    slug: string;
    mimeType: AgencyTourCover['mimeType'];
    bytes: Uint8Array;
    updatedAt: string;
  }): Promise<AgencyTourRecord | null> {
    const current = this.tours.get(input.slug);
    if (current == null) return null;

    const nextVersion = current.coverImageVersion + 1;
    const next: AgencyTourRecord = {
      ...current,
      coverImageVersion: nextVersion,
      coverImageMimeType: input.mimeType,
      updatedAt: input.updatedAt,
    };
    this.tours.set(input.slug, next);
    this.tourCovers.set(input.slug, {
      mimeType: input.mimeType,
      bytes: Uint8Array.from(input.bytes),
      version: nextVersion,
    });
    return structuredClone(next);
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

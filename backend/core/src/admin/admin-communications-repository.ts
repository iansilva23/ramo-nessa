import type { AuthSubjectType } from '../auth/auth-session-repository.js';
import type { PushPlatform } from '../notifications/push-device-repository.js';

export type AdminNotificationAudience = 'all' | 'passenger' | 'driver';
export type AdminNotificationCategory =
  | 'general'
  | 'event'
  | 'service'
  | 'maintenance'
  | 'update'
  | 'promotion';

export interface AdminNotificationCampaignRecord {
  id: string;
  audience: AdminNotificationAudience;
  category: AdminNotificationCategory;
  title: string;
  body: string;
  providerKind: string;
  deviceCount: number;
  deliveredCount: number;
  invalidatedCount: number;
  createdByName: string;
  createdAt: string;
}

export interface AppReleasePolicyRecord {
  appKind: AuthSubjectType;
  platform: PushPlatform;
  latestVersion: string;
  latestBuild: number;
  minimumBuild: number;
  storeUrl?: string;
  updateMessage: string;
  updatedAt: string;
}

export interface AgencyPromotionRecord {
  id: 'ramo-nessa-agencia';
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  ctaLabel: string;
  ctaUrl?: string;
  updatedAt: string;
}

export interface SocialLinksRecord {
  instagramHandle?: string;
  instagramUrl?: string;
  updatedAt: string;
}

export interface AdminCommunicationsRepository {
  createCampaign(
    record: AdminNotificationCampaignRecord,
  ): Promise<AdminNotificationCampaignRecord>;
  listCampaigns(limit: number): Promise<AdminNotificationCampaignRecord[]>;
  getReleasePolicy(
    appKind: AuthSubjectType,
    platform: PushPlatform,
  ): Promise<AppReleasePolicyRecord>;
  listReleasePolicies(): Promise<AppReleasePolicyRecord[]>;
  saveReleasePolicy(
    record: AppReleasePolicyRecord,
  ): Promise<AppReleasePolicyRecord>;
  getAgencyPromotion(): Promise<AgencyPromotionRecord>;
  saveAgencyPromotion(
    record: AgencyPromotionRecord,
  ): Promise<AgencyPromotionRecord>;
  getSocialLinks(): Promise<SocialLinksRecord>;
  saveSocialLinks(
    record: SocialLinksRecord,
  ): Promise<SocialLinksRecord>;
}

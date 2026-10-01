export const DRIVER_BENEFIT_CATEGORIES = [
  'moto',
  'delivery',
  'car',
  'comfort_black',
  'buggy',
] as const;

export type DriverBenefitCategory =
  (typeof DRIVER_BENEFIT_CATEGORIES)[number];

export type DriverBenefitRegionMode =
  | 'ride'
  | 'driver_base'
  | 'both';

export type DriverBenefitParticipantMode =
  | 'eligible'
  | 'selected';

export type DriverBenefitCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'ended';

export interface DriverBenefitRegion {
  zoneId: string;
  localityId?: string;
}

export type DriverBenefitMissionKind =
  | 'completed_rides'
  | 'five_star_ratings';

export interface DriverBenefitMission {
  id: string;
  title: string;
  kind: DriverBenefitMissionKind;
  target: number;
  bonusPoints: number;
}

export interface DriverBenefitPrize {
  rank: number;
  label: string;
}

export interface DriverBenefitSettingsRecord {
  enabled: boolean;
  updatedAt: string;
}

export interface DriverBenefitCampaignRecord {
  id: string;
  name: string;
  category: DriverBenefitCategory;
  regionMode: DriverBenefitRegionMode;
  participantMode: DriverBenefitParticipantMode;
  regions: DriverBenefitRegion[];
  participantDriverIds: string[];
  excludedDriverIds: string[];
  status: DriverBenefitCampaignStatus;
  startsAt: string;
  endsAt: string;
  topCount: number;
  minParticipants: number;
  ridePoints: number;
  fiveStarPoints: number;
  fourStarPoints: number;
  lowCancellationMaxBps: number;
  lowCancellationBonusPoints: number;
  missions: DriverBenefitMission[];
  prizes: DriverBenefitPrize[];
  createdAt: string;
  updatedAt: string;
}

export interface DriverBenefitBaseRecord {
  driverId: string;
  zoneId: string;
  localityId?: string;
  updatedAt: string;
}

export interface DriverBenefitStatsRecord {
  driverId: string;
  displayName: string;
  baseZoneId?: string;
  baseLocalityId?: string;
  completedRides: number;
  cancelledByDriver: number;
  fiveStarRatings: number;
  fourStarRatings: number;
  ratingSum: number;
  ratingCount: number;
}

export interface DriverBenefitRepository {
  getSettings(): Promise<DriverBenefitSettingsRecord>;
  updateSettings(input: {
    enabled: boolean;
    updatedAt: string;
  }): Promise<DriverBenefitSettingsRecord>;

  listCampaigns(): Promise<DriverBenefitCampaignRecord[]>;
  findCampaign(id: string): Promise<DriverBenefitCampaignRecord | null>;
  createCampaign(
    campaign: DriverBenefitCampaignRecord,
  ): Promise<DriverBenefitCampaignRecord>;
  updateCampaign(
    campaign: DriverBenefitCampaignRecord,
  ): Promise<DriverBenefitCampaignRecord>;

  findDriverBase(driverId: string): Promise<DriverBenefitBaseRecord | null>;
  setDriverBase(
    base: DriverBenefitBaseRecord,
  ): Promise<DriverBenefitBaseRecord>;
  clearDriverBase(driverId: string): Promise<boolean>;

  rankingStats(
    campaign: DriverBenefitCampaignRecord,
  ): Promise<DriverBenefitStatsRecord[]>;
}

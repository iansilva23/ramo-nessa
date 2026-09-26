import type { Pool } from 'pg';

import type { AuthSubjectType } from '../../auth/auth-session-repository.js';
import type { PushPlatform } from '../../notifications/push-device-repository.js';
import type {
  AdminCommunicationsRepository,
  AdminNotificationAudience,
  AdminNotificationCampaignRecord,
  AdminNotificationCategory,
  AgencyPromotionRecord,
  AgencyTourCover,
  AgencyTourRecord,
  AppReleasePolicyRecord,
  SocialLinksRecord,
} from '../admin-communications-repository.js';

interface CampaignRow {
  id: string;
  audience: AdminNotificationAudience;
  category: AdminNotificationCategory;
  title: string;
  body: string;
  provider_kind: string;
  device_count: number;
  delivered_count: number;
  invalidated_count: number;
  created_by_name: string;
  created_at: Date;
}

interface ReleaseRow {
  app_kind: AuthSubjectType;
  platform: PushPlatform;
  latest_version: string;
  latest_build: number;
  minimum_build: number;
  store_url: string | null;
  update_message: string;
  updated_at: Date;
}

interface SocialLinksRow {
  instagram_handle: string | null;
  instagram_url: string | null;
  updated_at: Date;
}

interface TourRow {
  slug: string;
  enabled: boolean;
  sort_order: number;
  title: string;
  badge: string;
  short_description: string;
  description: string;
  highlights: string[];
  included: string[];
  excluded: string[];
  duration: string | null;
  schedule: string | null;
  departure: string | null;
  price_label: string;
  price_cents: number | null;
  price_suffix: string | null;
  whatsapp_phone: string;
  whatsapp_message: string;
  cover_image_mime_type: string | null;
  cover_image_version: number;
  updated_at: Date;
}

interface TourCoverRow {
  cover_image: Buffer;
  cover_image_mime_type: AgencyTourCover['mimeType'];
  cover_image_version: number;
}

interface PromotionRow {
  id: 'ramo-nessa-agencia';
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  cta_label: string;
  cta_url: string | null;
  updated_at: Date;
}

function mapCampaign(row: CampaignRow): AdminNotificationCampaignRecord {
  return {
    id: row.id,
    audience: row.audience,
    category: row.category,
    title: row.title,
    body: row.body,
    providerKind: row.provider_kind,
    deviceCount: row.device_count,
    deliveredCount: row.delivered_count,
    invalidatedCount: row.invalidated_count,
    createdByName: row.created_by_name,
    createdAt: row.created_at.toISOString(),
  };
}

function mapRelease(row: ReleaseRow): AppReleasePolicyRecord {
  return {
    appKind: row.app_kind,
    platform: row.platform,
    latestVersion: row.latest_version,
    latestBuild: row.latest_build,
    minimumBuild: row.minimum_build,
    ...(row.store_url == null ? {} : { storeUrl: row.store_url }),
    updateMessage: row.update_message,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSocialLinks(row: SocialLinksRow): SocialLinksRecord {
  return {
    ...(row.instagram_handle == null
      ? {}
      : { instagramHandle: row.instagram_handle }),
    ...(row.instagram_url == null
      ? {}
      : { instagramUrl: row.instagram_url }),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapTour(row: TourRow): AgencyTourRecord {
  return {
    slug: row.slug,
    enabled: row.enabled,
    sortOrder: row.sort_order,
    title: row.title,
    badge: row.badge,
    shortDescription: row.short_description,
    description: row.description,
    highlights: row.highlights,
    included: row.included,
    excluded: row.excluded,
    ...(row.duration == null ? {} : { duration: row.duration }),
    ...(row.schedule == null ? {} : { schedule: row.schedule }),
    ...(row.departure == null ? {} : { departure: row.departure }),
    priceLabel: row.price_label,
    ...(row.price_cents == null ? {} : { priceCents: row.price_cents }),
    ...(row.price_suffix == null ? {} : { priceSuffix: row.price_suffix }),
    whatsappPhone: row.whatsapp_phone,
    whatsappMessage: row.whatsapp_message,
    coverImageVersion: row.cover_image_version,
    ...(row.cover_image_mime_type == null
      ? {}
      : { coverImageMimeType: row.cover_image_mime_type }),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapPromotion(row: PromotionRow): AgencyPromotionRecord {
  return {
    id: row.id,
    enabled: row.enabled,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    ctaLabel: row.cta_label,
    ...(row.cta_url == null ? {} : { ctaUrl: row.cta_url }),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresAdminCommunicationsRepository
  implements AdminCommunicationsRepository {
  constructor(private readonly pool: Pool) {}

  async createCampaign(
    record: AdminNotificationCampaignRecord,
  ): Promise<AdminNotificationCampaignRecord> {
    const result = await this.pool.query<CampaignRow>(
      `INSERT INTO admin_notification_campaigns (
         id, audience, category, title, body, provider_kind,
         device_count, delivered_count, invalidated_count,
         created_by_name, created_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        record.id,
        record.audience,
        record.category,
        record.title,
        record.body,
        record.providerKind,
        record.deviceCount,
        record.deliveredCount,
        record.invalidatedCount,
        record.createdByName,
        record.createdAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Campanha não foi persistida.');
    return mapCampaign(row);
  }

  async listCampaigns(
    limit: number,
  ): Promise<AdminNotificationCampaignRecord[]> {
    const result = await this.pool.query<CampaignRow>(
      `SELECT *
       FROM admin_notification_campaigns
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [Math.max(1, Math.min(100, Math.trunc(limit)))],
    );
    return result.rows.map(mapCampaign);
  }

  async getReleasePolicy(
    appKind: AuthSubjectType,
    platform: PushPlatform,
  ): Promise<AppReleasePolicyRecord> {
    const result = await this.pool.query<ReleaseRow>(
      `SELECT *
       FROM app_release_policies
       WHERE app_kind = $1 AND platform = $2
       LIMIT 1`,
      [appKind, platform],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Política de versão não encontrada.');
    return mapRelease(row);
  }

  async listReleasePolicies(): Promise<AppReleasePolicyRecord[]> {
    const result = await this.pool.query<ReleaseRow>(
      `SELECT *
       FROM app_release_policies
       ORDER BY app_kind, platform`,
    );
    return result.rows.map(mapRelease);
  }

  async saveReleasePolicy(
    record: AppReleasePolicyRecord,
  ): Promise<AppReleasePolicyRecord> {
    const result = await this.pool.query<ReleaseRow>(
      `INSERT INTO app_release_policies (
         app_kind, platform, latest_version, latest_build,
         minimum_build, store_url, update_message, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (app_kind, platform)
       DO UPDATE SET
         latest_version = EXCLUDED.latest_version,
         latest_build = EXCLUDED.latest_build,
         minimum_build = EXCLUDED.minimum_build,
         store_url = EXCLUDED.store_url,
         update_message = EXCLUDED.update_message,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        record.appKind,
        record.platform,
        record.latestVersion,
        record.latestBuild,
        record.minimumBuild,
        record.storeUrl ?? null,
        record.updateMessage,
        record.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Política de versão não foi persistida.');
    return mapRelease(row);
  }

  async getAgencyPromotion(): Promise<AgencyPromotionRecord> {
    const result = await this.pool.query<PromotionRow>(
      `SELECT *
       FROM agency_promotion
       WHERE id = 'ramo-nessa-agencia'
       LIMIT 1`,
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Promoção da agência não encontrada.');
    return mapPromotion(row);
  }

  async saveAgencyPromotion(
    record: AgencyPromotionRecord,
  ): Promise<AgencyPromotionRecord> {
    const result = await this.pool.query<PromotionRow>(
      `INSERT INTO agency_promotion (
         id, enabled, title, subtitle, description,
         cta_label, cta_url, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         title = EXCLUDED.title,
         subtitle = EXCLUDED.subtitle,
         description = EXCLUDED.description,
         cta_label = EXCLUDED.cta_label,
         cta_url = EXCLUDED.cta_url,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        record.id,
        record.enabled,
        record.title,
        record.subtitle,
        record.description,
        record.ctaLabel,
        record.ctaUrl ?? null,
        record.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Promoção da agência não foi persistida.');
    return mapPromotion(row);
  }

  async getSocialLinks(): Promise<SocialLinksRecord> {
    const result = await this.pool.query<SocialLinksRow>(
      `SELECT instagram_handle, instagram_url, updated_at
       FROM app_social_links
       WHERE id = 'ramo-nessa'
       LIMIT 1`,
    );
    const row = result.rows[0];
    if (row == null) {
      return { updatedAt: new Date(0).toISOString() };
    }
    return mapSocialLinks(row);
  }

  async listTours(
    includeDisabled: boolean,
  ): Promise<AgencyTourRecord[]> {
    const result = await this.pool.query<TourRow>(
      `SELECT slug, enabled, sort_order, title, badge,
              short_description, description, highlights, included,
              excluded, duration, schedule, departure, price_label,
              price_cents, price_suffix, whatsapp_phone,
              whatsapp_message, cover_image_mime_type,
              cover_image_version, updated_at
       FROM agency_tours
       WHERE ($1::boolean = true OR enabled = true)
       ORDER BY sort_order ASC, title ASC, slug ASC`,
      [includeDisabled],
    );
    return result.rows.map(mapTour);
  }

  async getTour(slug: string): Promise<AgencyTourRecord | null> {
    const result = await this.pool.query<TourRow>(
      `SELECT slug, enabled, sort_order, title, badge,
              short_description, description, highlights, included,
              excluded, duration, schedule, departure, price_label,
              price_cents, price_suffix, whatsapp_phone,
              whatsapp_message, cover_image_mime_type,
              cover_image_version, updated_at
       FROM agency_tours
       WHERE slug = $1
       LIMIT 1`,
      [slug],
    );
    const row = result.rows[0];
    return row == null ? null : mapTour(row);
  }

  async saveTour(record: AgencyTourRecord): Promise<AgencyTourRecord> {
    const result = await this.pool.query<TourRow>(
      `INSERT INTO agency_tours (
         slug, enabled, sort_order, title, badge, short_description,
         description, highlights, included, excluded, duration,
         schedule, departure, price_label, price_cents, price_suffix,
         whatsapp_phone, whatsapp_message, updated_at
       )
       VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
       )
       ON CONFLICT (slug)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         sort_order = EXCLUDED.sort_order,
         title = EXCLUDED.title,
         badge = EXCLUDED.badge,
         short_description = EXCLUDED.short_description,
         description = EXCLUDED.description,
         highlights = EXCLUDED.highlights,
         included = EXCLUDED.included,
         excluded = EXCLUDED.excluded,
         duration = EXCLUDED.duration,
         schedule = EXCLUDED.schedule,
         departure = EXCLUDED.departure,
         price_label = EXCLUDED.price_label,
         price_cents = EXCLUDED.price_cents,
         price_suffix = EXCLUDED.price_suffix,
         whatsapp_phone = EXCLUDED.whatsapp_phone,
         whatsapp_message = EXCLUDED.whatsapp_message,
         updated_at = EXCLUDED.updated_at
       RETURNING slug, enabled, sort_order, title, badge,
                 short_description, description, highlights, included,
                 excluded, duration, schedule, departure, price_label,
                 price_cents, price_suffix, whatsapp_phone,
                 whatsapp_message, cover_image_mime_type,
                 cover_image_version, updated_at`,
      [
        record.slug,
        record.enabled,
        record.sortOrder,
        record.title,
        record.badge,
        record.shortDescription,
        record.description,
        record.highlights,
        record.included,
        record.excluded,
        record.duration ?? null,
        record.schedule ?? null,
        record.departure ?? null,
        record.priceLabel,
        record.priceCents ?? null,
        record.priceSuffix ?? null,
        record.whatsappPhone,
        record.whatsappMessage,
        record.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Passeio não foi persistido.');
    return mapTour(row);
  }

  async readTourCover(slug: string): Promise<AgencyTourCover | null> {
    const result = await this.pool.query<TourCoverRow>(
      `SELECT cover_image, cover_image_mime_type, cover_image_version
       FROM agency_tours
       WHERE slug = $1
         AND cover_image IS NOT NULL
         AND cover_image_mime_type IS NOT NULL
       LIMIT 1`,
      [slug],
    );
    const row = result.rows[0];
    if (row == null) return null;
    return {
      mimeType: row.cover_image_mime_type,
      bytes: row.cover_image,
      version: row.cover_image_version,
    };
  }

  async saveTourCover(input: {
    slug: string;
    mimeType: AgencyTourCover['mimeType'];
    bytes: Uint8Array;
    updatedAt: string;
  }): Promise<AgencyTourRecord | null> {
    const result = await this.pool.query<TourRow>(
      `UPDATE agency_tours
       SET cover_image = $2,
           cover_image_mime_type = $3,
           cover_image_version = cover_image_version + 1,
           updated_at = $4
       WHERE slug = $1
       RETURNING slug, enabled, sort_order, title, badge,
                 short_description, description, highlights, included,
                 excluded, duration, schedule, departure, price_label,
                 price_cents, price_suffix, whatsapp_phone,
                 whatsapp_message, cover_image_mime_type,
                 cover_image_version, updated_at`,
      [input.slug, Buffer.from(input.bytes), input.mimeType, input.updatedAt],
    );
    const row = result.rows[0];
    return row == null ? null : mapTour(row);
  }

  async saveSocialLinks(
    record: SocialLinksRecord,
  ): Promise<SocialLinksRecord> {
    const result = await this.pool.query<SocialLinksRow>(
      `INSERT INTO app_social_links (
         id, instagram_handle, instagram_url, updated_at
       )
       VALUES ('ramo-nessa', $1, $2, $3)
       ON CONFLICT (id)
       DO UPDATE SET
         instagram_handle = EXCLUDED.instagram_handle,
         instagram_url = EXCLUDED.instagram_url,
         updated_at = EXCLUDED.updated_at
       RETURNING instagram_handle, instagram_url, updated_at`,
      [
        record.instagramHandle ?? null,
        record.instagramUrl ?? null,
        record.updatedAt,
      ],
    );
    const row = result.rows[0];
    if (row == null) throw new Error('Links sociais não foram persistidos.');
    return mapSocialLinks(row);
  }
}

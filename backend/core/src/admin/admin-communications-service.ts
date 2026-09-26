import { randomUUID } from 'node:crypto';

import type {
  AdminActor,
  AdminRepository,
} from './admin-repository.js';
import type {
  AdminCommunicationsRepository,
  AdminNotificationAudience,
  AdminNotificationCategory,
  AgencyPromotionRecord,
  AppReleasePolicyRecord,
} from './admin-communications-repository.js';
import type {
  PushDeviceRecord,
  PushDeviceRepository,
  PushPlatform,
} from '../notifications/push-device-repository.js';
import type { PushNotificationService } from '../notifications/push-notification-service.js';
import type { AuthSubjectType } from '../auth/auth-session-repository.js';

export class AdminCommunicationsError extends Error {
  constructor(
    public readonly code: 'PUSH_PROVIDER_DISABLED',
    message: string,
  ) {
    super(message);
    this.name = 'AdminCommunicationsError';
  }
}

export function releasePolicyView(
  policy: AppReleasePolicyRecord,
  currentBuild?: number,
) {
  const updateAvailable =
    currentBuild != null && currentBuild < policy.latestBuild;
  const updateRequired =
    currentBuild != null && currentBuild < policy.minimumBuild;
  return {
    ...policy,
    currentBuild: currentBuild ?? null,
    updateAvailable,
    updateRequired,
  };
}

function updatePushMessage(policy: AppReleasePolicyRecord) {
  return {
    type: 'app.update.available',
    title:
      policy.appKind === 'driver'
        ? 'Atualize o Ramo Nessa Motorista'
        : 'Atualize o Ramo Nessa',
    body: policy.updateMessage,
    data: {
      app: policy.appKind,
      platform: policy.platform,
      latestVersion: policy.latestVersion,
      latestBuild: String(policy.latestBuild),
      minimumBuild: String(policy.minimumBuild),
      ...(policy.storeUrl == null
        ? {}
        : { storeUrl: policy.storeUrl }),
    },
  };
}

export async function adminCommunicationsView(input: {
  communications: AdminCommunicationsRepository;
  push: PushNotificationService;
}) {
  const [campaigns, releasePolicies, agencyPromotion, socialLinks] =
    await Promise.all([
      input.communications.listCampaigns(25),
      input.communications.listReleasePolicies(),
      input.communications.getAgencyPromotion(),
      input.communications.getSocialLinks(),
    ]);

  return {
    deliveryProvider: input.push.providerKind,
    campaigns,
    releasePolicies,
    agencyPromotion,
    socialLinks,
  };
}

export async function sendAdminNotification(input: {
  communications: AdminCommunicationsRepository;
  admin: AdminRepository;
  actor: AdminActor;
  push: PushNotificationService;
  audience: AdminNotificationAudience;
  category: AdminNotificationCategory;
  title: string;
  body: string;
  now?: Date;
}) {
  if (input.push.providerKind === 'disabled') {
    throw new AdminCommunicationsError(
      'PUSH_PROVIDER_DISABLED',
      'O envio real de notificações ainda não está conectado ao Firebase.',
    );
  }

  const now = input.now ?? new Date();
  const stats = await input.push.notifyAudience({
    audience: input.audience,
    message: {
      type: `admin.broadcast.${input.category}`,
      title: input.title,
      body: input.body,
      data: { category: input.category },
    },
    now,
  });

  const campaign = await input.communications.createCampaign({
    id: randomUUID(),
    audience: input.audience,
    category: input.category,
    title: input.title,
    body: input.body,
    providerKind: input.push.providerKind,
    deviceCount: stats.devices,
    deliveredCount: stats.delivered,
    invalidatedCount: stats.invalidated,
    createdByName: input.actor.name,
    createdAt: now.toISOString(),
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'communications.notification_sent',
    targetType: 'notification_campaign',
    targetId: campaign.id,
    metadata: {
      audience: campaign.audience,
      category: campaign.category,
      deviceCount: campaign.deviceCount,
      deliveredCount: campaign.deliveredCount,
      invalidatedCount: campaign.invalidatedCount,
      providerKind: campaign.providerKind,
    },
    createdAt: campaign.createdAt,
  });

  return campaign;
}

export async function updateAppReleasePolicy(input: {
  communications: AdminCommunicationsRepository;
  devices: PushDeviceRepository;
  admin: AdminRepository;
  actor: AdminActor;
  push: PushNotificationService;
  appKind: AuthSubjectType;
  platform: PushPlatform;
  latestVersion: string;
  latestBuild: number;
  minimumBuild: number;
  storeUrl?: string;
  updateMessage: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const policy = await input.communications.saveReleasePolicy({
    appKind: input.appKind,
    platform: input.platform,
    latestVersion: input.latestVersion,
    latestBuild: input.latestBuild,
    minimumBuild: input.minimumBuild,
    ...(input.storeUrl == null ? {} : { storeUrl: input.storeUrl }),
    updateMessage: input.updateMessage,
    updatedAt: now.toISOString(),
  });

  const outdated = await input.devices.listEnabledOutdated(
    policy.appKind,
    policy.platform,
    policy.latestBuild,
  );
  const requiredDevices = outdated.filter(
    (device) =>
      device.buildNumber != null &&
      device.buildNumber < policy.minimumBuild,
  ).length;

  let delivered = 0;
  let invalidated = 0;
  if (
    outdated.length > 0 &&
    input.push.providerKind !== 'disabled'
  ) {
    const stats = await input.push.notifyDevices({
      devices: outdated,
      message: updatePushMessage(policy),
      now,
    });
    delivered = stats.delivered;
    invalidated = stats.invalidated;
    await Promise.all(
      stats.deliveredDeviceIds.map((deviceId) =>
        input.devices.markUpdateNotified(
          deviceId,
          policy.latestBuild,
          now.toISOString(),
        ),
      ),
    );
  }

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'communications.release_policy_updated',
    targetType: 'app_release_policy',
    targetId: `${policy.appKind}:${policy.platform}`,
    metadata: {
      latestVersion: policy.latestVersion,
      latestBuild: policy.latestBuild,
      minimumBuild: policy.minimumBuild,
      outdatedDevices: outdated.length,
      requiredDevices,
      autoDelivered: delivered,
      invalidated,
      providerKind: input.push.providerKind,
    },
    createdAt: now.toISOString(),
  });

  return {
    policy,
    automaticNotification: {
      providerKind: input.push.providerKind,
      outdatedDevices: outdated.length,
      requiredDevices,
      delivered,
      invalidated,
    },
  };
}

export async function notifyRegisteredDeviceIfOutdated(input: {
  communications: AdminCommunicationsRepository;
  devices: PushDeviceRepository;
  push: PushNotificationService;
  device: PushDeviceRecord;
  now?: Date;
}) {
  const policy = await input.communications.getReleasePolicy(
    input.device.subjectType,
    input.device.platform,
  );
  const status = releasePolicyView(
    policy,
    input.device.buildNumber,
  );
  if (
    !status.updateAvailable ||
    input.device.lastUpdateNotifiedBuild === policy.latestBuild ||
    input.push.providerKind === 'disabled'
  ) {
    return {
      policy: status,
      notificationDelivered: false,
    };
  }

  const now = input.now ?? new Date();
  const result = await input.push.notifyDevices({
    devices: [input.device],
    message: updatePushMessage(policy),
    now,
  });
  if (result.deliveredDeviceIds.includes(input.device.id)) {
    await input.devices.markUpdateNotified(
      input.device.id,
      policy.latestBuild,
      now.toISOString(),
    );
  }

  return {
    policy: status,
    notificationDelivered: result.delivered > 0,
  };
}

export async function updateAgencyPromotion(input: {
  communications: AdminCommunicationsRepository;
  admin: AdminRepository;
  actor: AdminActor;
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  ctaLabel: string;
  ctaUrl?: string;
  now?: Date;
}): Promise<AgencyPromotionRecord> {
  const now = (input.now ?? new Date()).toISOString();
  const promotion = await input.communications.saveAgencyPromotion({
    id: 'ramo-nessa-agencia',
    enabled: input.enabled,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    ctaLabel: input.ctaLabel,
    ...(input.ctaUrl == null ? {} : { ctaUrl: input.ctaUrl }),
    updatedAt: now,
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'communications.agency_promotion_updated',
    targetType: 'agency_promotion',
    targetId: promotion.id,
    metadata: {
      enabled: promotion.enabled,
      title: promotion.title,
      hasCtaUrl: promotion.ctaUrl != null,
    },
    createdAt: now,
  });

  return promotion;
}


export async function updateSocialLinks(input: {
  communications: AdminCommunicationsRepository;
  admin: AdminRepository;
  actor: AdminActor;
  instagramHandle?: string;
  instagramUrl?: string;
  now?: Date;
}) {
  const now = (input.now ?? new Date()).toISOString();
  const record = await input.communications.saveSocialLinks({
    ...(input.instagramHandle == null
      ? {}
      : { instagramHandle: input.instagramHandle }),
    ...(input.instagramUrl == null
      ? {}
      : { instagramUrl: input.instagramUrl }),
    updatedAt: now,
  });

  await input.admin.appendAudit({
    id: randomUUID(),
    actor: input.actor,
    action: 'communications.social_links_updated',
    targetType: 'social_links',
    targetId: 'ramo-nessa',
    metadata: {
      instagramConfigured: record.instagramUrl != null,
      instagramHandle: record.instagramHandle ?? null,
    },
    createdAt: now,
  });

  return record;
}

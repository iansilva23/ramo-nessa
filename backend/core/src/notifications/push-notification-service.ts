import { createHash, randomUUID } from 'node:crypto';

import type { AuthSessionRecord } from '../auth/auth-session-repository.js';
import type {
  PushDeviceRecord,
  PushDeviceRepository,
} from './push-device-repository.js';
import type {
  PushDeliveryProvider,
  PushMessage,
} from './push-delivery-provider.js';
import type { PushDeviceRegistrationRequest } from './push-device-validation.js';

function hashPushToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function pushDevicePublicView(device: PushDeviceRecord) {
  return {
    id: device.id,
    platform: device.platform,
    provider: device.provider,
    enabled: device.enabled,
    ...(device.appVersion == null
      ? {}
      : { appVersion: device.appVersion }),
    ...(device.buildNumber == null
      ? {}
      : { buildNumber: device.buildNumber }),
    updatedAt: device.updatedAt,
  };
}

export async function registerPushDevice(input: {
  repository: PushDeviceRepository;
  session: AuthSessionRecord;
  registration: PushDeviceRegistrationRequest;
  now?: Date;
}) {
  const instant = (input.now ?? new Date()).toISOString();
  return input.repository.registerForSession({
    id: randomUUID(),
    sessionId: input.session.id,
    subjectId: input.session.subjectId,
    subjectType: input.session.subjectType,
    platform: input.registration.platform,
    provider: input.registration.provider,
    token: input.registration.token,
    tokenHash: hashPushToken(input.registration.token),
    ...(input.registration.appVersion == null
      ? {}
      : { appVersion: input.registration.appVersion }),
    ...(input.registration.buildNumber == null
      ? {}
      : { buildNumber: input.registration.buildNumber }),
    createdAt: instant,
    updatedAt: instant,
  });
}

export interface PushNotificationStats {
  devices: number;
  delivered: number;
  invalidated: number;
}

let defaultPushNotificationService: PushNotificationService | null = null;

export class PushNotificationService {
  constructor(
    private readonly repository: PushDeviceRepository,
    private readonly provider: PushDeliveryProvider,
    registerAsDefault = true,
  ) {
    if (registerAsDefault) {
      defaultPushNotificationService = this;
    }
  }

  get providerKind(): string {
    return this.provider.kind;
  }

  async notifyDevices(input: {
    devices: readonly PushDeviceRecord[];
    message: PushMessage;
    now?: Date;
  }): Promise<PushNotificationStats & { deliveredDeviceIds: string[] }> {
    const devices = input.devices;
    let delivered = 0;
    let invalidated = 0;
    const deliveredDeviceIds: string[] = [];

    for (const device of devices) {
      try {
        const result = await this.provider.send({
          token: device.token,
          tokenProvider: device.provider,
          platform: device.platform,
          message: input.message,
        });
        if (result.delivered) {
          delivered += 1;
          deliveredDeviceIds.push(device.id);
        }
        if (result.invalidToken) {
          await this.repository.disableDevice(
            device.id,
            (input.now ?? new Date()).toISOString(),
          );
          invalidated += 1;
        }
      } catch {
        // Push nunca deve quebrar o fluxo crítico da corrida.
      }
    }

    return {
      devices: devices.length,
      delivered,
      invalidated,
      deliveredDeviceIds,
    };
  }

  async notifySubject(input: {
    subjectType: AuthSessionRecord['subjectType'];
    subjectId: string;
    message: PushMessage;
    now?: Date;
  }): Promise<PushNotificationStats> {
    const devices = await this.repository.listEnabledForSubject(
      input.subjectType,
      input.subjectId,
    );
    const result = await this.notifyDevices({
      devices,
      message: input.message,
      ...(input.now == null ? {} : { now: input.now }),
    });
    return {
      devices: result.devices,
      delivered: result.delivered,
      invalidated: result.invalidated,
    };
  }

  async notifyAudience(input: {
    audience: 'all' | AuthSessionRecord['subjectType'];
    message: PushMessage;
    now?: Date;
  }): Promise<PushNotificationStats> {
    const devices = await this.repository.listEnabledByAudience(
      input.audience,
    );
    const result = await this.notifyDevices({
      devices,
      message: input.message,
      ...(input.now == null ? {} : { now: input.now }),
    });
    return {
      devices: result.devices,
      delivered: result.delivered,
      invalidated: result.invalidated,
    };
  }
}


export function notifyDefaultPushSubject(input: {
  subjectType: AuthSessionRecord['subjectType'];
  subjectId: string;
  message: PushMessage;
}): void {
  const service = defaultPushNotificationService;
  if (service == null) return;

  void service.notifySubject(input).catch(() => {
    // Push é best-effort e nunca bloqueia matching ou estado da corrida.
  });
}

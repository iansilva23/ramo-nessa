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
    createdAt: instant,
    updatedAt: instant,
  });
}

export interface PushNotificationStats {
  devices: number;
  delivered: number;
  invalidated: number;
}

export class PushNotificationService {
  constructor(
    private readonly repository: PushDeviceRepository,
    private readonly provider: PushDeliveryProvider,
  ) {}

  get providerKind(): string {
    return this.provider.kind;
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
    let delivered = 0;
    let invalidated = 0;

    for (const device of devices) {
      try {
        const result = await this.provider.send({
          token: device.token,
          tokenProvider: device.provider,
          platform: device.platform,
          message: input.message,
        });
        if (result.delivered) delivered += 1;
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
    };
  }
}

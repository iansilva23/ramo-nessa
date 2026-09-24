import type {
  PushDeviceRecord,
  PushDeviceRepository,
  RegisterPushDeviceInput,
} from '../push-device-repository.js';

export class InMemoryPushDeviceRepository
  implements PushDeviceRepository {
  private readonly devices = new Map<string, PushDeviceRecord>();

  async registerForSession(
    input: RegisterPushDeviceInput,
  ): Promise<PushDeviceRecord> {
    for (const [id, device] of this.devices) {
      if (
        device.sessionId === input.sessionId &&
        device.enabled &&
        device.tokenHash !== input.tokenHash
      ) {
        this.devices.set(id, {
          ...device,
          enabled: false,
          disabledAt: input.updatedAt,
          updatedAt: input.updatedAt,
        });
      }
    }

    const existing = [...this.devices.values()].find(
      (device) => device.tokenHash === input.tokenHash,
    );
    const next: PushDeviceRecord = existing == null
      ? { ...input, enabled: true }
      : (() => {
          const {
            disabledAt: _disabledAt,
            ...existingWithoutDisabledAt
          } = existing;
          return {
            ...existingWithoutDisabledAt,
            sessionId: input.sessionId,
            subjectId: input.subjectId,
            subjectType: input.subjectType,
            platform: input.platform,
            provider: input.provider,
            token: input.token,
            tokenHash: input.tokenHash,
            enabled: true,
            updatedAt: input.updatedAt,
          };
        })();

    this.devices.set(next.id, structuredClone(next));
    return structuredClone(next);
  }

  async listEnabledForSubject(
    subjectType: PushDeviceRecord['subjectType'],
    subjectId: string,
  ): Promise<PushDeviceRecord[]> {
    return [...this.devices.values()]
      .filter(
        (device) =>
          device.subjectType === subjectType &&
          device.subjectId === subjectId &&
          device.enabled,
      )
      .map((device) => structuredClone(device));
  }

  async disableForSession(
    sessionId: string,
    disabledAt: string,
  ): Promise<number> {
    let changed = 0;
    for (const [id, device] of this.devices) {
      if (device.sessionId !== sessionId || !device.enabled) continue;
      this.devices.set(id, {
        ...device,
        enabled: false,
        disabledAt,
        updatedAt: disabledAt,
      });
      changed += 1;
    }
    return changed;
  }

  async disableDevice(id: string, disabledAt: string): Promise<void> {
    const device = this.devices.get(id);
    if (device == null || !device.enabled) return;
    this.devices.set(id, {
      ...device,
      enabled: false,
      disabledAt,
      updatedAt: disabledAt,
    });
  }
}

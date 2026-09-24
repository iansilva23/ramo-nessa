import type {
  OperationalSettingsRecord,
  OperationalSettingsRepository,
} from './operational-settings-repository.js';

export class InMemoryOperationalSettingsRepository
  implements OperationalSettingsRepository
{
  private record: OperationalSettingsRecord = {
    driverOfferTtlSeconds: 35,
    showNearbyDrivers: false,
    updatedAt: '1970-01-01T00:00:00.000Z',
  };

  async get(): Promise<OperationalSettingsRecord> {
    return structuredClone(this.record);
  }

  async update(input: {
    driverOfferTtlSeconds?: number;
    showNearbyDrivers?: boolean;
    updatedAt: string;
  }): Promise<OperationalSettingsRecord> {
    this.record = {
      driverOfferTtlSeconds:
        input.driverOfferTtlSeconds ?? this.record.driverOfferTtlSeconds,
      showNearbyDrivers:
        input.showNearbyDrivers ?? this.record.showNearbyDrivers,
      updatedAt: input.updatedAt,
    };
    return structuredClone(this.record);
  }
}

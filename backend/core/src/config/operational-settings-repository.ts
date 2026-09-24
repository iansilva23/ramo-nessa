export interface OperationalSettingsRecord {
  driverOfferTtlSeconds: number;
  showNearbyDrivers: boolean;
  updatedAt: string;
}

export interface OperationalSettingsRepository {
  get(): Promise<OperationalSettingsRecord>;
  update(input: {
    driverOfferTtlSeconds?: number;
    showNearbyDrivers?: boolean;
    updatedAt: string;
  }): Promise<OperationalSettingsRecord>;
}

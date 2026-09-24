export interface OperationalSettingsRecord {
  driverOfferTtlSeconds: number;
  showNearbyDrivers: boolean;
  mercadoPagoPublicKey?: string;
  updatedAt: string;
}

export interface OperationalSettingsRepository {
  get(): Promise<OperationalSettingsRecord>;
  update(input: {
    driverOfferTtlSeconds?: number;
    showNearbyDrivers?: boolean;
    mercadoPagoPublicKey?: string | null;
    updatedAt: string;
  }): Promise<OperationalSettingsRecord>;
}

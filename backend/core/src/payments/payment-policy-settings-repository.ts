export interface PaymentPolicySettingsRecord {
  cashEnabled: boolean;
  updatedAt: string;
}

export interface DriverCashPolicyOverrideRecord {
  driverId: string;
  debtLimitCents: number;
  updatedAt: string;
}

export interface PaymentPolicySettingsRepository {
  get(): Promise<PaymentPolicySettingsRecord>;
  setCashEnabled(
    enabled: boolean,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord>;
  getDriverCashDebtLimitOverride(
    driverId: string,
  ): Promise<DriverCashPolicyOverrideRecord | null>;
  setDriverCashDebtLimitOverride(
    driverId: string,
    debtLimitCents: number,
    updatedAt: string,
  ): Promise<DriverCashPolicyOverrideRecord>;
  clearDriverCashDebtLimitOverride(
    driverId: string,
  ): Promise<void>;
}

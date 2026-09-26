export interface PaymentPolicySettingsRecord {
  cashEnabled: boolean;
  pixEnabled: boolean;
  cardEnabled: boolean;
  walletEnabled: boolean;
  defaultCashDebtLimitCents: number;
  pixPriceAdjustmentBps: number;
  cardPriceAdjustmentBps: number;
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
  setPixPriceAdjustmentBps(
    bps: number,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord>;
  setCardPriceAdjustmentBps(
    bps: number,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord>;
  setDigitalMethods(
    input: {
      pixEnabled?: boolean;
      cardEnabled?: boolean;
      walletEnabled?: boolean;
    },
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord>;
  setDefaultCashDebtLimitCents(
    cents: number,
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

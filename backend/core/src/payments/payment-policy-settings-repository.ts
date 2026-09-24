export interface PaymentPolicySettingsRecord {
  cashEnabled: boolean;
  updatedAt: string;
}

export interface PaymentPolicySettingsRepository {
  get(): Promise<PaymentPolicySettingsRecord>;
  setCashEnabled(
    enabled: boolean,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord>;
}

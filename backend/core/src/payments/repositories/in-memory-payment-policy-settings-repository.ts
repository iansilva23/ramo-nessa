import type {
  DriverCashPolicyOverrideRecord,
  PaymentPolicySettingsRecord,
  PaymentPolicySettingsRepository,
} from '../payment-policy-settings-repository.js';

export class InMemoryPaymentPolicySettingsRepository
  implements PaymentPolicySettingsRepository
{
  private record: PaymentPolicySettingsRecord = {
    cashEnabled: false,
    updatedAt: '1970-01-01T00:00:00.000Z',
  };

  private readonly driverCashOverrides =
    new Map<string, DriverCashPolicyOverrideRecord>();

  async get(): Promise<PaymentPolicySettingsRecord> {
    return structuredClone(this.record);
  }

  async setCashEnabled(
    enabled: boolean,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord> {
    this.record = {
      cashEnabled: enabled,
      updatedAt,
    };
    return structuredClone(this.record);
  }

  async getDriverCashDebtLimitOverride(
    driverId: string,
  ): Promise<DriverCashPolicyOverrideRecord | null> {
    const record = this.driverCashOverrides.get(driverId);
    return record == null ? null : structuredClone(record);
  }

  async setDriverCashDebtLimitOverride(
    driverId: string,
    debtLimitCents: number,
    updatedAt: string,
  ): Promise<DriverCashPolicyOverrideRecord> {
    const record: DriverCashPolicyOverrideRecord = {
      driverId,
      debtLimitCents,
      updatedAt,
    };
    this.driverCashOverrides.set(driverId, record);
    return structuredClone(record);
  }

  async clearDriverCashDebtLimitOverride(
    driverId: string,
  ): Promise<void> {
    this.driverCashOverrides.delete(driverId);
  }
}

import type {
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
}

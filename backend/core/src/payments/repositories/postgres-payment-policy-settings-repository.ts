import type { Pool } from 'pg';

import type {
  PaymentPolicySettingsRecord,
  PaymentPolicySettingsRepository,
} from '../payment-policy-settings-repository.js';

interface PaymentPolicySettingsRow {
  cash_enabled: boolean;
  updated_at: Date;
}

export class PostgresPaymentPolicySettingsRepository
  implements PaymentPolicySettingsRepository
{
  constructor(private readonly pool: Pool) {}

  async get(): Promise<PaymentPolicySettingsRecord> {
    const result = await this.pool.query<PaymentPolicySettingsRow>(
      `SELECT cash_enabled, updated_at
       FROM payment_policy_settings
       WHERE id = 1
       LIMIT 1`,
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração de pagamentos não foi inicializada.');
    }
    return {
      cashEnabled: row.cash_enabled,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async setCashEnabled(
    enabled: boolean,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord> {
    const result = await this.pool.query<PaymentPolicySettingsRow>(
      `UPDATE payment_policy_settings
       SET cash_enabled = $1, updated_at = $2
       WHERE id = 1
       RETURNING cash_enabled, updated_at`,
      [enabled, updatedAt],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração de pagamentos não encontrada.');
    }
    return {
      cashEnabled: row.cash_enabled,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

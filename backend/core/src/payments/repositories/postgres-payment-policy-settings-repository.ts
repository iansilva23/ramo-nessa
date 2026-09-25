import type { Pool } from 'pg';

import type {
  DriverCashPolicyOverrideRecord,
  PaymentPolicySettingsRecord,
  PaymentPolicySettingsRepository,
} from '../payment-policy-settings-repository.js';

interface PaymentPolicySettingsRow {
  cash_enabled: boolean;
  card_price_adjustment_bps: number;
  updated_at: Date;
}

interface DriverCashPolicyOverrideRow {
  driver_id: string;
  debt_limit_cents: number;
  updated_at: Date;
}

export class PostgresPaymentPolicySettingsRepository
  implements PaymentPolicySettingsRepository
{
  constructor(private readonly pool: Pool) {}

  async get(): Promise<PaymentPolicySettingsRecord> {
    const result = await this.pool.query<PaymentPolicySettingsRow>(
      `SELECT cash_enabled, card_price_adjustment_bps, updated_at
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
      cardPriceAdjustmentBps: row.card_price_adjustment_bps,
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
       RETURNING cash_enabled, card_price_adjustment_bps, updated_at`,
      [enabled, updatedAt],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração de pagamentos não encontrada.');
    }
    return {
      cashEnabled: row.cash_enabled,
      cardPriceAdjustmentBps: row.card_price_adjustment_bps,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async setCardPriceAdjustmentBps(
    bps: number,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord> {
    const result = await this.pool.query<PaymentPolicySettingsRow>(
      `UPDATE payment_policy_settings
       SET card_price_adjustment_bps = $1, updated_at = $2
       WHERE id = 1
       RETURNING cash_enabled, card_price_adjustment_bps, updated_at`,
      [bps, updatedAt],
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração de pagamentos não encontrada.');
    }
    return {
      cashEnabled: row.cash_enabled,
      cardPriceAdjustmentBps: row.card_price_adjustment_bps,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async getDriverCashDebtLimitOverride(
    driverId: string,
  ): Promise<DriverCashPolicyOverrideRecord | null> {
    const result =
      await this.pool.query<DriverCashPolicyOverrideRow>(
        `SELECT driver_id, debt_limit_cents, updated_at
         FROM driver_cash_policy_overrides
         WHERE driver_id = $1
         LIMIT 1`,
        [driverId],
      );
    const row = result.rows[0];
    return row == null
      ? null
      : {
          driverId: row.driver_id,
          debtLimitCents: row.debt_limit_cents,
          updatedAt: row.updated_at.toISOString(),
        };
  }

  async setDriverCashDebtLimitOverride(
    driverId: string,
    debtLimitCents: number,
    updatedAt: string,
  ): Promise<DriverCashPolicyOverrideRecord> {
    const result =
      await this.pool.query<DriverCashPolicyOverrideRow>(
        `INSERT INTO driver_cash_policy_overrides (
           driver_id,
           debt_limit_cents,
           updated_at
         )
         VALUES ($1, $2, $3)
         ON CONFLICT (driver_id)
         DO UPDATE SET
           debt_limit_cents = EXCLUDED.debt_limit_cents,
           updated_at = EXCLUDED.updated_at
         RETURNING driver_id, debt_limit_cents, updated_at`,
        [driverId, debtLimitCents, updatedAt],
      );
    const row = result.rows[0];
    if (row == null) {
      throw new Error(
        'Override cash do motorista não pôde ser salvo.',
      );
    }
    return {
      driverId: row.driver_id,
      debtLimitCents: row.debt_limit_cents,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async clearDriverCashDebtLimitOverride(
    driverId: string,
  ): Promise<void> {
    await this.pool.query(
      `DELETE FROM driver_cash_policy_overrides
       WHERE driver_id = $1`,
      [driverId],
    );
  }
}

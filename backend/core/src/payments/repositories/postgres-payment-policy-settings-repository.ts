import type { Pool } from 'pg';

import type {
  DriverCashPolicyOverrideRecord,
  PaymentPolicySettingsRecord,
  PaymentPolicySettingsRepository,
} from '../payment-policy-settings-repository.js';

interface PaymentPolicySettingsRow {
  cash_enabled: boolean;
  pix_enabled: boolean;
  card_enabled: boolean;
  wallet_enabled: boolean;
  default_cash_debt_limit_cents: number;
  pix_price_adjustment_bps: number;
  card_price_adjustment_bps: number;
  updated_at: Date;
}

interface DriverCashPolicyOverrideRow {
  driver_id: string;
  debt_limit_cents: number;
  updated_at: Date;
}

const POLICY_COLUMNS = `
  cash_enabled,
  pix_enabled,
  card_enabled,
  wallet_enabled,
  default_cash_debt_limit_cents,
  pix_price_adjustment_bps,
  card_price_adjustment_bps,
  updated_at
`;

function paymentPolicyRecord(
  row: PaymentPolicySettingsRow,
): PaymentPolicySettingsRecord {
  return {
    cashEnabled: row.cash_enabled,
    pixEnabled: row.pix_enabled,
    cardEnabled: row.card_enabled,
    walletEnabled: row.wallet_enabled,
    defaultCashDebtLimitCents: row.default_cash_debt_limit_cents,
    pixPriceAdjustmentBps: row.pix_price_adjustment_bps,
    cardPriceAdjustmentBps: row.card_price_adjustment_bps,
    updatedAt: row.updated_at.toISOString(),
  };
}

function requirePolicyRow(
  row: PaymentPolicySettingsRow | undefined,
): PaymentPolicySettingsRecord {
  if (row == null) {
    throw new Error('Configuração de pagamentos não encontrada.');
  }
  return paymentPolicyRecord(row);
}

export class PostgresPaymentPolicySettingsRepository
  implements PaymentPolicySettingsRepository
{
  constructor(private readonly pool: Pool) {}

  async get(): Promise<PaymentPolicySettingsRecord> {
    const result = await this.pool.query<PaymentPolicySettingsRow>(
      `SELECT ${POLICY_COLUMNS}
       FROM payment_policy_settings
       WHERE id = 1
       LIMIT 1`,
    );
    const row = result.rows[0];
    if (row == null) {
      throw new Error('Configuração de pagamentos não foi inicializada.');
    }
    return paymentPolicyRecord(row);
  }

  async setCashEnabled(
    enabled: boolean,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord> {
    const result = await this.pool.query<PaymentPolicySettingsRow>(
      `UPDATE payment_policy_settings
       SET cash_enabled = $1, updated_at = $2
       WHERE id = 1
       RETURNING ${POLICY_COLUMNS}`,
      [enabled, updatedAt],
    );
    return requirePolicyRow(result.rows[0]);
  }

  async setPixPriceAdjustmentBps(
    bps: number,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord> {
    const result = await this.pool.query<PaymentPolicySettingsRow>(
      `UPDATE payment_policy_settings
       SET pix_price_adjustment_bps = $1, updated_at = $2
       WHERE id = 1
       RETURNING ${POLICY_COLUMNS}`,
      [bps, updatedAt],
    );
    return requirePolicyRow(result.rows[0]);
  }

  async setCardPriceAdjustmentBps(
    bps: number,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord> {
    const result = await this.pool.query<PaymentPolicySettingsRow>(
      `UPDATE payment_policy_settings
       SET card_price_adjustment_bps = $1, updated_at = $2
       WHERE id = 1
       RETURNING ${POLICY_COLUMNS}`,
      [bps, updatedAt],
    );
    return requirePolicyRow(result.rows[0]);
  }

  async setDigitalMethods(
    input: {
      pixEnabled?: boolean;
      cardEnabled?: boolean;
      walletEnabled?: boolean;
    },
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord> {
    const current = await this.get();
    const result = await this.pool.query<PaymentPolicySettingsRow>(
      `UPDATE payment_policy_settings
       SET
         pix_enabled = $1,
         card_enabled = $2,
         wallet_enabled = $3,
         updated_at = $4
       WHERE id = 1
       RETURNING ${POLICY_COLUMNS}`,
      [
        input.pixEnabled ?? current.pixEnabled,
        input.cardEnabled ?? current.cardEnabled,
        input.walletEnabled ?? current.walletEnabled,
        updatedAt,
      ],
    );
    return requirePolicyRow(result.rows[0]);
  }

  async setDefaultCashDebtLimitCents(
    cents: number,
    updatedAt: string,
  ): Promise<PaymentPolicySettingsRecord> {
    const result = await this.pool.query<PaymentPolicySettingsRow>(
      `UPDATE payment_policy_settings
       SET default_cash_debt_limit_cents = $1, updated_at = $2
       WHERE id = 1
       RETURNING ${POLICY_COLUMNS}`,
      [cents, updatedAt],
    );
    return requirePolicyRow(result.rows[0]);
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

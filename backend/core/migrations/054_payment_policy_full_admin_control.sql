-- Migration 054: amplia o controle operacional de pagamentos pelo Admin.
-- Mantém os padrões atuais, mas remove a dependência de constantes hardcoded
-- para métodos digitais e limite cash padrão.

ALTER TABLE payment_policy_settings
  ADD COLUMN IF NOT EXISTS pix_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS card_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wallet_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS default_cash_debt_limit_cents integer NOT NULL DEFAULT 12000;

UPDATE payment_policy_settings
SET
  pix_enabled = COALESCE(pix_enabled, true),
  card_enabled = COALESCE(card_enabled, true),
  wallet_enabled = COALESCE(wallet_enabled, true),
  default_cash_debt_limit_cents =
    COALESCE(default_cash_debt_limit_cents, 12000)
WHERE id = 1;

ALTER TABLE payment_policy_settings
  DROP CONSTRAINT IF EXISTS payment_policy_settings_default_cash_limit_check;

ALTER TABLE payment_policy_settings
  ADD CONSTRAINT payment_policy_settings_default_cash_limit_check
  CHECK (
    default_cash_debt_limit_cents >= 0
    AND default_cash_debt_limit_cents <= 100000000
  );

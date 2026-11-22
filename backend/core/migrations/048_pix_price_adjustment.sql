-- Migration 048: preço final diferenciado para Pix.
--
-- 99 = 0,99%. O Core aplica gross-up para preservar a tarifa-base,
-- a divisão 90/10 e manter o acréscimo de processamento separado no ledger.

ALTER TABLE payment_policy_settings
  ADD COLUMN IF NOT EXISTS pix_price_adjustment_bps integer NOT NULL DEFAULT 99;

UPDATE payment_policy_settings
SET pix_price_adjustment_bps = 99
WHERE pix_price_adjustment_bps IS NULL;

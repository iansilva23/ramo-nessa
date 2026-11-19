-- Migration 047: preço final diferenciado para cartão.
--
-- 498 = 4,98%. O Core aplica gross-up para preservar a tarifa-base,
-- a divisão 90/10 e manter o acréscimo de cartão separado no ledger.

ALTER TABLE payment_policy_settings
  ADD COLUMN IF NOT EXISTS card_price_adjustment_bps integer NOT NULL DEFAULT 498;

UPDATE payment_policy_settings
SET card_price_adjustment_bps = 498
WHERE card_price_adjustment_bps IS NULL;

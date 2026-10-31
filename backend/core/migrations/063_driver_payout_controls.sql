-- Migration 063: controles de repasse do motorista.
--
-- Adiciona tipo do repasse, composição bruto/taxa/líquido,
-- aprovação de antecipação e modo automático/manual.

ALTER TABLE driver_payouts
  ADD COLUMN IF NOT EXISTS payout_kind text NOT NULL DEFAULT 'legacy';

ALTER TABLE driver_payouts
  ADD COLUMN IF NOT EXISTS requested_amount_cents integer;

ALTER TABLE driver_payouts
  ADD COLUMN IF NOT EXISTS fee_cents integer NOT NULL DEFAULT 0;

ALTER TABLE driver_payouts
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE driver_payouts
SET requested_amount_cents = amount_cents
WHERE requested_amount_cents IS NULL;

UPDATE driver_payouts
SET approved_at = COALESCE(approved_at, created_at)
WHERE payout_kind = 'legacy';

ALTER TABLE driver_payouts
  ALTER COLUMN requested_amount_cents SET NOT NULL;

ALTER TABLE driver_payouts
  DROP CONSTRAINT IF EXISTS driver_payouts_kind_check;

ALTER TABLE driver_payouts
  ADD CONSTRAINT driver_payouts_kind_check
  CHECK (payout_kind IN ('legacy', 'anticipation', 'scheduled', 'manual'));

ALTER TABLE driver_payouts
  DROP CONSTRAINT IF EXISTS driver_payouts_amount_breakdown_check;

ALTER TABLE driver_payouts
  ADD CONSTRAINT driver_payouts_amount_breakdown_check
  CHECK (
    requested_amount_cents > 0
    AND fee_cents >= 0
    AND amount_cents > 0
    AND requested_amount_cents = amount_cents + fee_cents
  );

CREATE INDEX IF NOT EXISTS driver_payouts_kind_status_idx
  ON driver_payouts (payout_kind, status, created_at);

CREATE TABLE IF NOT EXISTS driver_payout_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  automatic_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL
);

INSERT INTO driver_payout_settings (id, automatic_enabled, updated_at)
VALUES (1, true, now())
ON CONFLICT (id) DO NOTHING;

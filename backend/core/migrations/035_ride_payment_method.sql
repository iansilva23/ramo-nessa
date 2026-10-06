-- Migration 035: método de pagamento escolhido na corrida.
--
-- Mantém pagamentos digitais em payments/escrow e identifica cash sem criar
-- um pagamento digital fictício.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS payment_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rides_payment_method_check'
  ) THEN
    ALTER TABLE rides
      ADD CONSTRAINT rides_payment_method_check
      CHECK (
        payment_method IS NULL
        OR payment_method IN ('pix', 'card', 'wallet', 'cash')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rides_payment_method_state_idx
  ON rides (payment_method, state);

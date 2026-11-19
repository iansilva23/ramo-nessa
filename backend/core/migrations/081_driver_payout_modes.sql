-- Safe rollout: no payouts sent merely by upgrading or adding credentials.
ALTER TABLE driver_payout_settings ADD COLUMN mode text NOT NULL DEFAULT 'manual'
  CHECK (mode IN ('manual', 'semi_automatic', 'automatic'));
ALTER TABLE driver_payout_settings ALTER COLUMN automatic_enabled SET DEFAULT false;
UPDATE driver_payout_settings SET automatic_enabled = false, mode = 'manual', updated_at = now();
ALTER TABLE driver_payout_settings ADD CONSTRAINT driver_payout_mode_consistency
  CHECK (automatic_enabled = (mode = 'automatic'));
ALTER TABLE driver_payouts ADD COLUMN execution_mode text NOT NULL DEFAULT 'manual'
  CHECK (execution_mode IN ('manual', 'api'));
-- Preserve reconciliation of transfers already submitted. Unsent reservations remain external.
UPDATE driver_payouts SET execution_mode = 'api'
  WHERE status = 'processing' AND processor_payout_id IS NOT NULL;

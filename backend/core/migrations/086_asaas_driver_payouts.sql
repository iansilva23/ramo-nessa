-- No transfer is sent by this migration. Credentials and explicit arming are separate.
ALTER TABLE driver_payout_settings
  ADD COLUMN anticipation_minimum_cents integer NOT NULL DEFAULT 8000
    CHECK (anticipation_minimum_cents BETWEEN 1 AND 100000000),
  ADD COLUMN anticipation_fee_cents integer NOT NULL DEFAULT 1000
    CHECK (anticipation_fee_cents >= 0 AND anticipation_fee_cents < anticipation_minimum_cents);

CREATE TABLE asaas_driver_transfer_attempts (
  payout_id uuid PRIMARY KEY REFERENCES driver_payouts(id),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  transfer_id text UNIQUE,
  rejected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE asaas_driver_transfer_events (
  event_id text PRIMARY KEY,
  transfer_id text NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A provider upgrade must not inherit an armed automatic payout schedule.
-- The owner can explicitly reselect the desired mode after homologation.
UPDATE driver_payout_settings
  SET automatic_enabled = false, mode = 'manual', updated_at = now();

-- Experimental isolated branch: pending dispatch is recorded in the same transaction
-- as lock-triggered rejection. Do not deploy before the recovery worker is tested.
CREATE TABLE IF NOT EXISTS android_lock_dispatch_pending (
  offer_id UUID PRIMARY KEY,
  ride_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

-- Migration 068: cupons, campanhas e aplicação promocional nas corridas.
--
-- O motor de tarifa continua sendo a fonte do preço normal. A promoção fica
-- em uma camada separada e guarda um snapshot para auditoria financeira.

CREATE TABLE IF NOT EXISTS promotion_campaigns (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL CHECK (
    kind IN (
      'wallet_credit',
      'fixed_discount',
      'percent_discount',
      'free_ride',
      'fixed_driver_fare'
    )
  ),
  value_cents integer,
  percent_bps integer,
  max_discount_cents integer,
  fixed_driver_fare_cents integer,
  categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  max_redemptions integer NOT NULL CHECK (max_redemptions > 0),
  per_passenger_limit integer NOT NULL DEFAULT 1 CHECK (per_passenger_limit > 0),
  per_device_limit integer NOT NULL DEFAULT 1 CHECK (per_device_limit > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (
    (kind IN ('wallet_credit', 'fixed_discount')
      AND value_cents IS NOT NULL AND value_cents > 0)
    OR kind NOT IN ('wallet_credit', 'fixed_discount')
  ),
  CHECK (
    (kind = 'percent_discount'
      AND percent_bps IS NOT NULL
      AND percent_bps BETWEEN 1 AND 10000)
    OR kind <> 'percent_discount'
  ),
  CHECK (
    max_discount_cents IS NULL OR max_discount_cents > 0
  ),
  CHECK (
    (kind = 'fixed_driver_fare'
      AND fixed_driver_fare_cents IS NOT NULL
      AND fixed_driver_fare_cents > 0)
    OR kind <> 'fixed_driver_fare'
  )
);

CREATE INDEX IF NOT EXISTS promotion_campaigns_enabled_idx
  ON promotion_campaigns (enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS passenger_promotion_preferences (
  passenger_id text PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES promotion_campaigns(id),
  device_hash text NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES promotion_campaigns(id),
  passenger_id text NOT NULL,
  device_hash text NOT NULL,
  ride_id uuid REFERENCES rides(id) ON DELETE CASCADE,
  reference_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('reserved', 'redeemed', 'released')),
  normal_total_cents integer NOT NULL CHECK (normal_total_cents >= 0),
  discount_cents integer NOT NULL CHECK (discount_cents >= 0),
  passenger_payable_cents integer NOT NULL CHECK (passenger_payable_cents >= 0),
  driver_earnings_cents integer NOT NULL CHECK (driver_earnings_cents >= 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS promotion_redemptions_active_ride_idx
  ON promotion_redemptions (ride_id)
  WHERE ride_id IS NOT NULL AND status <> 'released';

CREATE INDEX IF NOT EXISTS promotion_redemptions_campaign_status_idx
  ON promotion_redemptions (campaign_id, status, expires_at);

CREATE INDEX IF NOT EXISTS promotion_redemptions_passenger_idx
  ON promotion_redemptions (campaign_id, passenger_id, status, expires_at);

CREATE INDEX IF NOT EXISTS promotion_redemptions_device_idx
  ON promotion_redemptions (campaign_id, device_hash, status, expires_at);

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS promotion_snapshot jsonb;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN ('pix', 'card', 'wallet', 'promotion'));

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_amount_cents_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_amount_cents_check
  CHECK (amount_cents >= 0);

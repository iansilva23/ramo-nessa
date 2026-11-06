-- Migration 007: ofertas de corrida e ocupação do motorista.

ALTER TABLE driver_supply
  ADD COLUMN IF NOT EXISTS busy boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS driver_supply_available_idx
  ON driver_supply (online, busy, location_updated_at DESC);

CREATE TABLE IF NOT EXISTS ride_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES rides(id),
  driver_id text NOT NULL REFERENCES driver_supply(driver_id),
  status text NOT NULL CHECK (
    status IN ('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')
  ),
  approximate_pickup_distance_km numeric(10,3) NOT NULL
    CHECK (approximate_pickup_distance_km >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ride_offers_ride_created_idx
  ON ride_offers (ride_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ride_offers_driver_created_idx
  ON ride_offers (driver_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ride_offers_one_accepted_per_ride_idx
  ON ride_offers (ride_id)
  WHERE status = 'ACCEPTED';

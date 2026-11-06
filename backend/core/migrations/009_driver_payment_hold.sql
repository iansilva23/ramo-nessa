-- Migration 009: reserva curta de motorista durante pagamento.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS reserved_driver_id text
    REFERENCES driver_supply(driver_id),
  ADD COLUMN IF NOT EXISTS driver_hold_expires_at timestamptz;

ALTER TABLE driver_supply
  ADD COLUMN IF NOT EXISTS reserved_ride_id uuid
    REFERENCES rides(id),
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz;

CREATE INDEX IF NOT EXISTS driver_supply_reservation_idx
  ON driver_supply (reserved_until)
  WHERE reserved_ride_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rides_reserved_driver_idx
  ON rides (reserved_driver_id, driver_hold_expires_at)
  WHERE reserved_driver_id IS NOT NULL;

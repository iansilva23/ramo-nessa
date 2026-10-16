-- Migration 003: motorista atribuído à corrida.
ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS driver_id text;

CREATE INDEX IF NOT EXISTS rides_driver_created_idx
  ON rides (driver_id, created_at DESC)
  WHERE driver_id IS NOT NULL;

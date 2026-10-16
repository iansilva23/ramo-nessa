-- Migration 056: parâmetros operacionais de localização do motorista.
-- Administráveis pelo painel sem rebuild dos apps.

ALTER TABLE operational_settings
  ADD COLUMN IF NOT EXISTS driver_location_max_age_seconds integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS nearby_driver_max_distance_km numeric(8,3) NOT NULL DEFAULT 15;

ALTER TABLE operational_settings
  DROP CONSTRAINT IF EXISTS operational_settings_driver_location_max_age_check,
  DROP CONSTRAINT IF EXISTS operational_settings_nearby_driver_distance_check;

ALTER TABLE operational_settings
  ADD CONSTRAINT operational_settings_driver_location_max_age_check
    CHECK (driver_location_max_age_seconds BETWEEN 15 AND 600),
  ADD CONSTRAINT operational_settings_nearby_driver_distance_check
    CHECK (
      nearby_driver_max_distance_km >= 0.5
      AND nearby_driver_max_distance_km <= 100
    );

UPDATE operational_settings
SET
  driver_location_max_age_seconds =
    COALESCE(driver_location_max_age_seconds, 120),
  nearby_driver_max_distance_km =
    COALESCE(nearby_driver_max_distance_km, 15)
WHERE id = 1;

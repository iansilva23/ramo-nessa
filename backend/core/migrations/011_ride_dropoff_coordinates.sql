-- Migration 011: destino exato persistido para navegação do motorista.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS dropoff_latitude numeric(9,6)
    CHECK (dropoff_latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS dropoff_longitude numeric(9,6)
    CHECK (dropoff_longitude BETWEEN -180 AND 180);

ALTER TABLE rides
  DROP CONSTRAINT IF EXISTS rides_dropoff_coordinates_pair_check;

ALTER TABLE rides
  ADD CONSTRAINT rides_dropoff_coordinates_pair_check CHECK (
    (dropoff_latitude IS NULL AND dropoff_longitude IS NULL)
    OR
    (dropoff_latitude IS NOT NULL AND dropoff_longitude IS NOT NULL)
  );

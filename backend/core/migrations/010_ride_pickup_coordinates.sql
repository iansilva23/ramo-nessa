-- Migration 010: ponto de embarque persistido para despacho pós-pagamento.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS pickup_latitude numeric(9,6)
    CHECK (pickup_latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS pickup_longitude numeric(9,6)
    CHECK (pickup_longitude BETWEEN -180 AND 180);

ALTER TABLE rides
  DROP CONSTRAINT IF EXISTS rides_pickup_coordinates_pair_check;

ALTER TABLE rides
  ADD CONSTRAINT rides_pickup_coordinates_pair_check CHECK (
    (pickup_latitude IS NULL AND pickup_longitude IS NULL)
    OR
    (pickup_latitude IS NOT NULL AND pickup_longitude IS NOT NULL)
  );

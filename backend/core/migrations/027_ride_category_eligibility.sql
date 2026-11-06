-- Migration 027: congela a exigência 4x4 comercial em cada corrida.
--
-- Corridas antigas recebem a semântica v1: Comfort/Black cruzando o limite de
-- Jericoacoara exige 4x4. Novas corridas persistem a política do catálogo
-- comercial vigente no momento da cotação.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS requires_four_by_four boolean;

UPDATE rides
SET requires_four_by_four = (
  category = 'comfort_black'
  AND (
    (origin_zone_id = 'jericoacoara'
      AND destination_zone_id <> 'jericoacoara')
    OR
    (origin_zone_id <> 'jericoacoara'
      AND destination_zone_id = 'jericoacoara')
  )
)
WHERE requires_four_by_four IS NULL;

ALTER TABLE rides
  ALTER COLUMN requires_four_by_four SET DEFAULT false;

ALTER TABLE rides
  ALTER COLUMN requires_four_by_four SET NOT NULL;

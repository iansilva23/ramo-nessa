-- Migration 062: identidade de Google Place para locais salvos do Passageiro.
--
-- Não persistimos placeProof porque ela é curta e expira.
-- Guardamos apenas a identidade estável e a classificação aprovada como hint;
-- a autoridade é renovada pelo Core/Google Places quando o favorito é usado.

ALTER TABLE passenger_saved_places
  ADD COLUMN IF NOT EXISTS provider_place_id text,
  ADD COLUMN IF NOT EXISTS approved_pricing_zone_id text,
  ADD COLUMN IF NOT EXISTS approved_pricing_locality_id text;

ALTER TABLE passenger_saved_places
  DROP CONSTRAINT IF EXISTS passenger_saved_places_provider_place_id_check;

ALTER TABLE passenger_saved_places
  ADD CONSTRAINT passenger_saved_places_provider_place_id_check
  CHECK (
    provider_place_id IS NULL
    OR char_length(provider_place_id) BETWEEN 3 AND 256
  );

ALTER TABLE passenger_saved_places
  DROP CONSTRAINT IF EXISTS passenger_saved_places_pricing_zone_check;

ALTER TABLE passenger_saved_places
  ADD CONSTRAINT passenger_saved_places_pricing_zone_check
  CHECK (
    approved_pricing_zone_id IS NULL
    OR approved_pricing_zone_id IN (
      'jericoacoara',
      'jijoca',
      'prea',
      'external'
    )
  );

ALTER TABLE passenger_saved_places
  DROP CONSTRAINT IF EXISTS passenger_saved_places_pricing_locality_check;

ALTER TABLE passenger_saved_places
  ADD CONSTRAINT passenger_saved_places_pricing_locality_check
  CHECK (
    approved_pricing_locality_id IS NULL
    OR approved_pricing_locality_id ~ '^[a-z0-9][a-z0-9-]{0,119}$'
  );

ALTER TABLE passenger_saved_places
  DROP CONSTRAINT IF EXISTS passenger_saved_places_pricing_pair_check;

ALTER TABLE passenger_saved_places
  ADD CONSTRAINT passenger_saved_places_pricing_pair_check
  CHECK (
    (approved_pricing_zone_id IS NULL AND approved_pricing_locality_id IS NULL)
    OR
    (
      approved_pricing_zone_id IS NOT NULL
      AND approved_pricing_locality_id IS NOT NULL
      AND provider_place_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS passenger_saved_places_provider_place_idx
  ON passenger_saved_places (passenger_id, provider_place_id)
  WHERE provider_place_id IS NOT NULL;

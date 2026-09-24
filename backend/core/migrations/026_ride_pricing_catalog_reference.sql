-- Migration 026: congela a origem da versão comercial em cada corrida.
--
-- Corridas antigas permanecem válidas com referência nula (catálogo estático v1).
-- Novas corridas podem registrar a versão publicada efetiva usada na cotação.

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS pricing_catalog_label text;

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS pricing_catalog_version_id uuid
    REFERENCES pricing_catalog_versions(id);

ALTER TABLE rides
  ADD COLUMN IF NOT EXISTS pricing_catalog_version_number bigint;

UPDATE rides
SET pricing_catalog_label = 'v1'
WHERE pricing_catalog_label IS NULL;

ALTER TABLE rides
  ALTER COLUMN pricing_catalog_label SET DEFAULT 'v1';

ALTER TABLE rides
  ALTER COLUMN pricing_catalog_label SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rides_pricing_catalog_version_pair_check'
  ) THEN
    ALTER TABLE rides
      ADD CONSTRAINT rides_pricing_catalog_version_pair_check
      CHECK (
        (pricing_catalog_version_id IS NULL
          AND pricing_catalog_version_number IS NULL)
        OR
        (pricing_catalog_version_id IS NOT NULL
          AND pricing_catalog_version_number IS NOT NULL)
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS rides_pricing_catalog_version_idx
  ON rides (pricing_catalog_version_id)
  WHERE pricing_catalog_version_id IS NOT NULL;

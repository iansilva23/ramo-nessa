-- GeoDB housekeeping only. No destructive migration or automatic activation.
ALTER TABLE geo_catalog_places
  ADD COLUMN IF NOT EXISTS selection_count bigint NOT NULL DEFAULT 0
    CHECK (selection_count >= 0);
ALTER TABLE geo_catalog_places
  ADD COLUMN IF NOT EXISTS last_selected_at timestamptz;

CREATE INDEX IF NOT EXISTS geo_catalog_retention_idx
  ON geo_catalog_places(updated_at, last_selected_at)
  WHERE source IN ('osm','overture');
CREATE INDEX IF NOT EXISTS geo_catalog_popular_idx
  ON geo_catalog_places(updated_at, last_selected_at)
  WHERE source = 'osm' AND selection_count >= 3;

CREATE TABLE IF NOT EXISTS geo_storage_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  max_storage_mb integer NOT NULL DEFAULT 128 CHECK(max_storage_mb BETWEEN 16 AND 2048),
  alert_percent integer NOT NULL DEFAULT 80 CHECK(alert_percent BETWEEN 50 AND 95),
  retention_days integer NOT NULL DEFAULT 120 CHECK(retention_days BETWEEN 120 AND 365),
  auto_cleanup_enabled boolean NOT NULL DEFAULT false,
  last_cleanup_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO geo_storage_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

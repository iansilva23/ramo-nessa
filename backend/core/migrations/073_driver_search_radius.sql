ALTER TABLE operational_settings ADD COLUMN driver_search_max_distance_km numeric NOT NULL DEFAULT 5
  CHECK (driver_search_max_distance_km BETWEEN 0.5 AND 100);

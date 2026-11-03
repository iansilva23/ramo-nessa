ALTER TABLE operational_settings ADD COLUMN driver_search_policy jsonb;

ALTER TABLE rides ADD COLUMN driver_search_max_distance_km numeric CHECK (driver_search_max_distance_km BETWEEN 0.5 AND 100);

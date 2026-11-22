-- Passenger-driven learning: no user identifiers, raw searches or Google place content.
-- place_id is the only persisted Google Maps data in this structure.
CREATE TABLE IF NOT EXISTS geo_passenger_place_references (
  place_id text PRIMARY KEY CHECK (char_length(place_id) BETWEEN 3 AND 256),
  selections bigint NOT NULL DEFAULT 1 CHECK (selections >= 1),
  last_selected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS geo_passenger_reference_last_idx
  ON geo_passenger_place_references(last_selected_at);

CREATE TABLE IF NOT EXISTS geo_passenger_learning_regions (
  region text PRIMARY KEY CHECK (region IN ('prea','jeri','jijoca')),
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  next_allowed_at timestamptz NOT NULL,
  total_imported bigint NOT NULL DEFAULT 0 CHECK (total_imported >= 0),
  last_imported integer NOT NULL DEFAULT 0 CHECK (last_imported >= 0)
);

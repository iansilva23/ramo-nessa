-- One immutable driver-to-passenger rating per completed ride.
CREATE TABLE IF NOT EXISTS passenger_ratings (
  ride_id uuid PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE,
  driver_id text NOT NULL,
  passenger_id text NOT NULL,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  reasons text[] NOT NULL DEFAULT '{}' CHECK (
    cardinality(reasons) <= 5 AND
    reasons <@ ARRAY['polite','punctual','respectful','communication','other']::text[]
  ),
  comment text CHECK (char_length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passenger_ratings_passenger_created_idx
  ON passenger_ratings(passenger_id, created_at);

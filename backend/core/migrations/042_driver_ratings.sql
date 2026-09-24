-- Migration 042: avaliações de motoristas por corrida concluída.

CREATE TABLE IF NOT EXISTS driver_ratings (
  ride_id uuid PRIMARY KEY REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id text NOT NULL,
  driver_id text NOT NULL
    REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS driver_ratings_driver_created_idx
  ON driver_ratings (driver_id, created_at DESC);

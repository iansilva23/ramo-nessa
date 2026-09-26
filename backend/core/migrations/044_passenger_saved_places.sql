-- Migration 044: locais salvos do passageiro.

CREATE TABLE IF NOT EXISTS passenger_saved_places (
  id uuid PRIMARY KEY,
  passenger_id text NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('home', 'work', 'custom')),
  label text NOT NULL
    CHECK (char_length(label) BETWEEN 2 AND 40),
  name text NOT NULL
    CHECK (char_length(name) BETWEEN 2 AND 120),
  address text NOT NULL
    CHECK (char_length(address) BETWEEN 2 AND 240),
  latitude numeric(9,6) NOT NULL
    CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL
    CHECK (longitude BETWEEN -180 AND 180),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS passenger_saved_places_special_slot_idx
  ON passenger_saved_places (passenger_id, kind)
  WHERE kind IN ('home', 'work');

CREATE INDEX IF NOT EXISTS passenger_saved_places_passenger_updated_idx
  ON passenger_saved_places (passenger_id, updated_at DESC, id DESC);

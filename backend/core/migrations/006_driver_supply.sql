-- Migration 006: disponibilidade operacional do motorista.
--
-- Esta tabela é a projeção usada pelo matching. Documentos, aprovação
-- cadastral e cadastro completo do veículo serão domínios próprios.

CREATE TABLE IF NOT EXISTS driver_supply (
  driver_id text PRIMARY KEY,
  vehicle_id text NOT NULL,
  categories text[] NOT NULL,
  four_by_four boolean NOT NULL DEFAULT false,
  seat_capacity integer NOT NULL CHECK (seat_capacity >= 1),
  online boolean NOT NULL DEFAULT false,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location_updated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(categories) > 0)
);

CREATE INDEX IF NOT EXISTS driver_supply_online_location_idx
  ON driver_supply (online, location_updated_at DESC);

CREATE INDEX IF NOT EXISTS driver_supply_categories_gin_idx
  ON driver_supply USING gin (categories);

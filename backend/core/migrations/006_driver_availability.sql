-- Migration 006: disponibilidade e posição operacional do motorista.
--
-- Não exige PostGIS nesta primeira etapa. O Core busca um conjunto pequeno
-- de motoristas elegíveis e usa Haversine apenas para ordenar candidatos.
-- A distância usada em preço/compensação continua sendo distância roteada.

CREATE TABLE IF NOT EXISTS driver_availability (
  driver_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('offline', 'available', 'busy')),
  service_categories text[] NOT NULL,
  passenger_capacity integer NOT NULL CHECK (
    passenger_capacity BETWEEN 1 AND 12
  ),
  jeri_4x4_eligible boolean NOT NULL DEFAULT false,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  last_seen_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS driver_availability_status_seen_idx
  ON driver_availability (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS driver_availability_categories_gin_idx
  ON driver_availability USING gin (service_categories);

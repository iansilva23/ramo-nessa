-- Migration 022: cadastro administrativo de motorista e veículo.
--
-- Mantém dados cadastrais separados de driver_supply, que continua sendo apenas
-- a projeção operacional usada pelo matching.

CREATE TABLE IF NOT EXISTS driver_profiles (
  driver_id text PRIMARY KEY,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 3 AND 120),
  preferred_name text,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'suspended')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (
    preferred_name IS NULL
    OR char_length(preferred_name) BETWEEN 2 AND 80
  )
);

CREATE TABLE IF NOT EXISTS driver_vehicles (
  id uuid PRIMARY KEY,
  driver_id text NOT NULL UNIQUE
    REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
  plate_normalized text NOT NULL UNIQUE,
  make text NOT NULL CHECK (char_length(make) BETWEEN 2 AND 60),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 80),
  model_year integer NOT NULL CHECK (model_year BETWEEN 1980 AND 2100),
  color text NOT NULL CHECK (char_length(color) BETWEEN 2 AND 40),
  categories text[] NOT NULL CHECK (cardinality(categories) > 0),
  four_by_four boolean NOT NULL DEFAULT false,
  seat_capacity integer NOT NULL CHECK (seat_capacity BETWEEN 1 AND 12),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'suspended')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS driver_profiles_status_updated_idx
  ON driver_profiles (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS driver_vehicles_status_updated_idx
  ON driver_vehicles (status, updated_at DESC);

-- Admins que já podiam operar autenticação de motoristas recebem o novo escopo
-- equivalente, evitando bloquear instalações existentes.
UPDATE admin_api_keys
SET scopes = array_append(scopes, 'drivers:profile:read')
WHERE 'drivers:auth:read' = ANY(scopes)
  AND NOT ('drivers:profile:read' = ANY(scopes));

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'drivers:profile:write')
WHERE 'drivers:auth:write' = ANY(scopes)
  AND NOT ('drivers:profile:write' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'drivers:profile:read')
WHERE 'drivers:auth:read' = ANY(scopes)
  AND NOT ('drivers:profile:read' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'drivers:profile:write')
WHERE 'drivers:auth:write' = ANY(scopes)
  AND NOT ('drivers:profile:write' = ANY(scopes));

-- Migration 070: Ranking & Benefícios de motoristas.
--
-- O módulo nasce globalmente DESATIVADO. Campanhas são independentes e não
-- criam pagamentos, saques ou lançamentos financeiros. Prêmios são apenas
-- descrições administrativas; qualquer Pix continua manual fora do sistema.

CREATE TABLE IF NOT EXISTS driver_benefit_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL
);

INSERT INTO driver_benefit_settings (id, enabled, updated_at)
VALUES (1, false, now())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS driver_benefit_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 100),
  category text NOT NULL CHECK (
    category IN ('moto', 'delivery', 'car', 'comfort_black', 'buggy')
  ),
  region_mode text NOT NULL CHECK (
    region_mode IN ('ride', 'driver_base', 'both')
  ),
  participant_mode text NOT NULL CHECK (
    participant_mode IN ('eligible', 'selected')
  ),
  regions jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(regions) = 'array'),
  participant_driver_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  excluded_driver_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'scheduled', 'active', 'paused', 'ended')
  ),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  top_count integer NOT NULL DEFAULT 3 CHECK (top_count BETWEEN 1 AND 50),
  min_participants integer NOT NULL DEFAULT 1
    CHECK (min_participants BETWEEN 1 AND 10000),
  ride_points integer NOT NULL DEFAULT 20 CHECK (ride_points BETWEEN 0 AND 100000),
  five_star_points integer NOT NULL DEFAULT 5
    CHECK (five_star_points BETWEEN 0 AND 100000),
  four_star_points integer NOT NULL DEFAULT 2
    CHECK (four_star_points BETWEEN 0 AND 100000),
  low_cancellation_max_bps integer NOT NULL DEFAULT 500
    CHECK (low_cancellation_max_bps BETWEEN 0 AND 10000),
  low_cancellation_bonus_points integer NOT NULL DEFAULT 100
    CHECK (low_cancellation_bonus_points BETWEEN 0 AND 100000),
  missions jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(missions) = 'array'),
  prizes jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(prizes) = 'array'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS driver_benefit_campaigns_status_period_idx
  ON driver_benefit_campaigns (status, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS driver_benefit_campaigns_category_idx
  ON driver_benefit_campaigns (category, updated_at DESC);

CREATE TABLE IF NOT EXISTS driver_benefit_driver_bases (
  driver_id text PRIMARY KEY
    REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
  zone_id text NOT NULL CHECK (char_length(zone_id) BETWEEN 1 AND 80),
  locality_id text,
  updated_at timestamptz NOT NULL,
  CHECK (
    locality_id IS NULL OR char_length(locality_id) BETWEEN 1 AND 120
  )
);

CREATE INDEX IF NOT EXISTS driver_benefit_driver_bases_region_idx
  ON driver_benefit_driver_bases (zone_id, locality_id);

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'drivers:benefits:read')
WHERE 'drivers:profile:read' = ANY(scopes)
  AND NOT ('drivers:benefits:read' = ANY(scopes));

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'drivers:benefits:write')
WHERE 'drivers:profile:write' = ANY(scopes)
  AND NOT ('drivers:benefits:write' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'drivers:benefits:read')
WHERE 'drivers:profile:read' = ANY(scopes)
  AND NOT ('drivers:benefits:read' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'drivers:benefits:write')
WHERE 'drivers:profile:write' = ANY(scopes)
  AND NOT ('drivers:benefits:write' = ANY(scopes));

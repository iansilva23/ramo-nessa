-- Migration 039: configurações operacionais remotas da mobilidade.
--
-- Singleton controlado pelo ADM para parâmetros que devem mudar
-- sem exigir novo build dos aplicativos.

CREATE TABLE IF NOT EXISTS operational_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  driver_offer_ttl_seconds integer NOT NULL
    CHECK (driver_offer_ttl_seconds BETWEEN 5 AND 120),
  show_nearby_drivers boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL
);

INSERT INTO operational_settings (
  id,
  driver_offer_ttl_seconds,
  show_nearby_drivers,
  updated_at
)
VALUES (1, 35, false, now())
ON CONFLICT (id) DO NOTHING;

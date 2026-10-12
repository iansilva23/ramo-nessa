-- GeoDB independente das regras de preço e dos provedores de pagamento.
-- Registros originados de Google Places NÃO devem entrar nesta tabela.
CREATE TABLE IF NOT EXISTS geo_catalog_places (
  id text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('osm', 'overture', 'manual')),
  source_id text NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  normalized_address text NOT NULL,
  address text NOT NULL,
  category text NOT NULL,
  city text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source, source_id)
);
CREATE INDEX IF NOT EXISTS geo_catalog_name_idx ON geo_catalog_places(normalized_name text_pattern_ops);
CREATE INDEX IF NOT EXISTS geo_catalog_address_idx ON geo_catalog_places(normalized_address text_pattern_ops);
CREATE INDEX IF NOT EXISTS geo_catalog_coordinates_idx ON geo_catalog_places(latitude, longitude);
-- O ADM reutiliza os escopos de preços existentes; nenhum novo acesso é concedido.

-- Migration 025: versionamento e vigência do catálogo comercial.
--
-- Versões publicadas são imutáveis no fluxo de serviço. O catálogo estático v1
-- continua sendo o fallback enquanto nenhuma versão publicada efetiva existir.

CREATE TABLE IF NOT EXISTS pricing_catalog_versions (
  id uuid PRIMARY KEY,
  version_number bigserial UNIQUE NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'published')),
  snapshot jsonb NOT NULL,
  effective_from timestamptz,
  created_by_kind text NOT NULL CHECK (created_by_kind IN ('api_key', 'user')),
  created_by_id text NOT NULL,
  created_by_name text NOT NULL,
  published_by_kind text CHECK (published_by_kind IN ('api_key', 'user')),
  published_by_id text,
  published_by_name text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  published_at timestamptz,
  CHECK (
    (status = 'draft'
      AND effective_from IS NULL
      AND published_by_kind IS NULL
      AND published_by_id IS NULL
      AND published_by_name IS NULL
      AND published_at IS NULL)
    OR
    (status = 'published'
      AND effective_from IS NOT NULL
      AND published_by_kind IS NOT NULL
      AND published_by_id IS NOT NULL
      AND published_by_name IS NOT NULL
      AND published_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS pricing_catalog_versions_status_idx
  ON pricing_catalog_versions (status, version_number DESC);

CREATE INDEX IF NOT EXISTS pricing_catalog_versions_effective_idx
  ON pricing_catalog_versions (effective_from DESC, version_number DESC)
  WHERE status = 'published';

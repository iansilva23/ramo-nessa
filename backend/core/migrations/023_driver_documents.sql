-- Migration 023: metadados e revisão de documentos do motorista.
--
-- Arquivos reais NÃO são armazenados no PostgreSQL. storage_key é uma referência
-- opaca para um futuro storage privado. Nunca deve ser URL pública.

CREATE TABLE IF NOT EXISTS driver_documents (
  id uuid PRIMARY KEY,
  driver_id text NOT NULL
    REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
  document_type text NOT NULL
    CHECK (document_type IN ('driver_license', 'vehicle_registration')),
  storage_key text NOT NULL
    CHECK (
      char_length(storage_key) BETWEEN 8 AND 512
      AND storage_key !~ '^[A-Za-z][A-Za-z0-9+.-]*://'
      AND storage_key NOT LIKE '/%'
      AND storage_key NOT LIKE '%..%'
    ),
  content_sha256 text NOT NULL
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  size_bytes bigint NOT NULL
    CHECK (size_bytes BETWEEN 1 AND 20971520),
  expires_on date,
  status text NOT NULL
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  is_current boolean NOT NULL DEFAULT true,
  rejection_reason text,
  submitted_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewed_by_kind text
    CHECK (reviewed_by_kind IS NULL OR reviewed_by_kind IN ('api_key', 'user')),
  reviewed_by_id text,
  reviewed_by_name text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (
    (status = 'rejected' AND rejection_reason IS NOT NULL)
    OR (status <> 'rejected' AND rejection_reason IS NULL)
  ),
  CHECK (
    (reviewed_at IS NULL AND reviewed_by_kind IS NULL
      AND reviewed_by_id IS NULL AND reviewed_by_name IS NULL)
    OR
    (reviewed_at IS NOT NULL AND reviewed_by_kind IS NOT NULL
      AND reviewed_by_id IS NOT NULL AND reviewed_by_name IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS driver_documents_current_type_idx
  ON driver_documents (driver_id, document_type)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS driver_documents_driver_current_idx
  ON driver_documents (driver_id, is_current, document_type);

CREATE INDEX IF NOT EXISTS driver_documents_review_queue_idx
  ON driver_documents (status, submitted_at)
  WHERE is_current = true;

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'drivers:documents:read')
WHERE 'drivers:profile:read' = ANY(scopes)
  AND NOT ('drivers:documents:read' = ANY(scopes));

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'drivers:documents:write')
WHERE 'drivers:profile:write' = ANY(scopes)
  AND NOT ('drivers:documents:write' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'drivers:documents:read')
WHERE 'drivers:profile:read' = ANY(scopes)
  AND NOT ('drivers:documents:read' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'drivers:documents:write')
WHERE 'drivers:profile:write' = ANY(scopes)
  AND NOT ('drivers:documents:write' = ANY(scopes));

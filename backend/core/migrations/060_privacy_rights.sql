-- Migration 060: base operacional de privacidade/LGPD.
--
-- Documentos legais são versionados e imutáveis após publicação.
-- Aceite de termos/ciência do aviso de privacidade é separado de consentimentos.
-- Solicitações de direitos do titular mantêm protocolo mesmo que a conta deixe
-- de existir, por isso não possuem FK destrutiva para auth_identities.

CREATE TABLE IF NOT EXISTS legal_documents (
  document_type text NOT NULL CHECK (
    document_type IN ('privacy_policy', 'terms_of_use')
  ),
  version integer NOT NULL CHECK (version >= 1),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  content text NOT NULL CHECK (char_length(content) BETWEEN 50 AND 30000),
  status text NOT NULL CHECK (status IN ('published', 'retired')),
  effective_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (document_type, version)
);

CREATE INDEX IF NOT EXISTS legal_documents_effective_idx
  ON legal_documents (document_type, effective_at DESC, version DESC)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS legal_document_acceptances (
  id uuid PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('passenger', 'driver')),
  subject_id text NOT NULL,
  document_type text NOT NULL,
  document_version integer NOT NULL,
  accepted_at timestamptz NOT NULL,
  FOREIGN KEY (subject_type, subject_id)
    REFERENCES auth_identities(subject_type, subject_id)
    ON DELETE CASCADE,
  FOREIGN KEY (document_type, document_version)
    REFERENCES legal_documents(document_type, version)
    ON DELETE RESTRICT,
  UNIQUE (subject_type, subject_id, document_type, document_version)
);

CREATE INDEX IF NOT EXISTS legal_acceptances_subject_idx
  ON legal_document_acceptances (
    subject_type, subject_id, accepted_at DESC
  );

CREATE TABLE IF NOT EXISTS privacy_preferences (
  subject_type text NOT NULL CHECK (subject_type IN ('passenger', 'driver')),
  subject_id text NOT NULL,
  marketing_notifications_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (subject_type, subject_id),
  FOREIGN KEY (subject_type, subject_id)
    REFERENCES auth_identities(subject_type, subject_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id uuid PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('passenger', 'driver')),
  subject_id text NOT NULL,
  request_type text NOT NULL CHECK (
    request_type IN (
      'access',
      'correction',
      'deletion',
      'anonymization',
      'portability',
      'consent_revocation'
    )
  ),
  status text NOT NULL CHECK (
    status IN ('open', 'in_progress', 'completed', 'rejected')
  ),
  note text,
  response text,
  responded_by_name text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000),
  CHECK (response IS NULL OR char_length(response) BETWEEN 1 AND 4000),
  CHECK (
    (responded_at IS NULL AND responded_by_name IS NULL)
    OR
    (responded_at IS NOT NULL AND responded_by_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS data_subject_requests_subject_idx
  ON data_subject_requests (
    subject_type, subject_id, created_at DESC, id DESC
  );

CREATE INDEX IF NOT EXISTS data_subject_requests_admin_idx
  ON data_subject_requests (status, created_at DESC, id DESC);

UPDATE admin_users
SET scopes = array_append(scopes, 'privacy:read'),
    updated_at = NOW()
WHERE NOT scopes @> ARRAY['privacy:read']::text[]
  AND (
    scopes @> ARRAY['passengers:auth:read']::text[]
    OR scopes @> ARRAY['drivers:auth:read']::text[]
  );

UPDATE admin_users
SET scopes = array_append(scopes, 'privacy:write'),
    updated_at = NOW()
WHERE NOT scopes @> ARRAY['privacy:write']::text[]
  AND (
    scopes @> ARRAY['passengers:auth:write']::text[]
    OR scopes @> ARRAY['drivers:auth:write']::text[]
  );

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'privacy:read')
WHERE NOT scopes @> ARRAY['privacy:read']::text[]
  AND (
    scopes @> ARRAY['passengers:auth:read']::text[]
    OR scopes @> ARRAY['drivers:auth:read']::text[]
  );

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'privacy:write')
WHERE NOT scopes @> ARRAY['privacy:write']::text[]
  AND (
    scopes @> ARRAY['passengers:auth:write']::text[]
    OR scopes @> ARRAY['drivers:auth:write']::text[]
  );

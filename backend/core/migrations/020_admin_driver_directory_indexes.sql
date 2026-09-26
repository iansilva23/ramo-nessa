-- Migration 020: índices do diretório administrativo de motoristas.

CREATE INDEX IF NOT EXISTS auth_identities_subject_updated_idx
  ON auth_identities (
    subject_type,
    updated_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS auth_identities_subject_status_updated_idx
  ON auth_identities (
    subject_type,
    status,
    updated_at DESC,
    id DESC
  );

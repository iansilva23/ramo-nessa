-- Migration 013: sessões de autenticação opacas.
--
-- O token bruto nunca é persistido. Somente SHA-256 é salvo.
-- Uma sessão pertence a um único subject/role e pode expirar ou ser revogada.

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  subject_id text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('passenger', 'driver')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_subject_idx
  ON auth_sessions (subject_type, subject_id);

CREATE INDEX IF NOT EXISTS auth_sessions_active_idx
  ON auth_sessions (expires_at)
  WHERE revoked_at IS NULL;

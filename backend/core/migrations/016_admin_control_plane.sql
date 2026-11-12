-- Migration 016: plano de controle administrativo.
--
-- Chaves administrativas são de alta entropia e somente o SHA-256 é persistido.
-- O token em claro é exibido uma única vez no provisionamento operacional.

CREATE TABLE IF NOT EXISTS admin_api_keys (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL CHECK (cardinality(scopes) > 0),
  created_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS admin_api_keys_active_idx
  ON admin_api_keys (created_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY,
  actor_key_id uuid NOT NULL REFERENCES admin_api_keys(id),
  actor_name text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON admin_audit_log (target_type, target_id, created_at DESC);

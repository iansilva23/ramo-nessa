-- Migration 018: autenticação humana do painel administrativo.
--
-- Senhas ficam em hash scrypt, segredo TOTP cifrado no app e sessões guardam
-- somente SHA-256 do token. Rate-limit armazena somente buckets HMAC.

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  email_normalized text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  totp_secret_ciphertext text NOT NULL,
  scopes text[] NOT NULL CHECK (cardinality(scopes) > 0),
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  last_totp_counter bigint,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_sessions_user_idx
  ON admin_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx
  ON admin_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_login_rate_limits (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_login_rate_limits_updated_idx
  ON admin_login_rate_limits (updated_at);

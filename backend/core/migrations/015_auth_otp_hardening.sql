-- Migration 015: rate-limit persistente do fluxo OTP.
--
-- bucket_key é sempre HMAC; telefone, IP e identificador do dispositivo
-- não são armazenados em claro nesta tabela.

CREATE TABLE IF NOT EXISTS auth_otp_rate_limits (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_otp_rate_limits_updated_idx
  ON auth_otp_rate_limits (updated_at);

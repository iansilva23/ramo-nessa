-- Migration 017: expiração obrigatória das chaves administrativas.
--
-- Chaves já existentes recebem validade de 90 dias a partir da criação.

ALTER TABLE admin_api_keys
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE admin_api_keys
SET expires_at = created_at + INTERVAL '90 days'
WHERE expires_at IS NULL;

ALTER TABLE admin_api_keys
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS admin_api_keys_expiry_idx
  ON admin_api_keys (expires_at)
  WHERE revoked_at IS NULL;

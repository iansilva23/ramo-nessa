-- Migration 030: configuração operacional persistente de pagamentos.
--
-- Dinheiro permanece desativado. O registro existe para que a política possa
-- ser administrada e auditada sem depender de constante hardcoded.

CREATE TABLE IF NOT EXISTS payment_policy_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  cash_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO payment_policy_settings (id, cash_enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'finance:write')
WHERE 'pricing:write' = ANY(scopes)
  AND NOT ('finance:write' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'finance:write')
WHERE 'pricing:write' = ANY(scopes)
  AND NOT ('finance:write' = ANY(scopes));

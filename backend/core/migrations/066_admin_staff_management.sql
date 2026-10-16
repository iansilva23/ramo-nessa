-- Migration 066: gestão de funcionários administrativos e permissões de Suporte.
--
-- Exclusão é lógica para preservar auditoria. Os escopos de Suporte são
-- separados de Comunicações, mantendo compatibilidade dos acessos existentes.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS admin_users_active_created_idx
  ON admin_users (created_at DESC)
  WHERE deleted_at IS NULL;

UPDATE admin_users
SET scopes = array_append(scopes, 'support:read')
WHERE deleted_at IS NULL
  AND scopes @> ARRAY['communications:read']::text[]
  AND NOT scopes @> ARRAY['support:read']::text[];

UPDATE admin_users
SET scopes = array_append(scopes, 'support:write')
WHERE deleted_at IS NULL
  AND scopes @> ARRAY['communications:write']::text[]
  AND NOT scopes @> ARRAY['support:write']::text[];

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'support:read')
WHERE scopes @> ARRAY['communications:read']::text[]
  AND NOT scopes @> ARRAY['support:read']::text[];

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'support:write')
WHERE scopes @> ARRAY['communications:write']::text[]
  AND NOT scopes @> ARRAY['support:write']::text[];

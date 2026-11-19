-- Migration 029: leitura administrativa do financeiro.
--
-- O escopo é separado de rides:read para manter menor privilégio.
-- Usuários/chaves operacionais que já liam viagens recebem finance:read.

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'finance:read')
WHERE 'rides:read' = ANY(scopes)
  AND NOT ('finance:read' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'finance:read')
WHERE 'rides:read' = ANY(scopes)
  AND NOT ('finance:read' = ANY(scopes));

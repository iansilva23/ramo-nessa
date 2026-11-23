-- Migration 028: leitura administrativa da frota em tempo real.
--
-- O escopo é separado de rides:read para permitir princípio do menor privilégio.
-- Usuários/chaves operacionais que já liam viagens recebem fleet:read na migração.

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'fleet:read')
WHERE 'rides:read' = ANY(scopes)
  AND NOT ('fleet:read' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'fleet:read')
WHERE 'rides:read' = ANY(scopes)
  AND NOT ('fleet:read' = ANY(scopes));

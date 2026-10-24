-- Migration 031: permissão administrativa para bloquear/desbloquear passageiros.
--
-- Operadores que já administram acesso de motoristas recebem a capacidade
-- equivalente para passageiros.

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'passengers:auth:write')
WHERE 'drivers:auth:write' = ANY(scopes)
  AND NOT ('passengers:auth:write' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'passengers:auth:write')
WHERE 'drivers:auth:write' = ANY(scopes)
  AND NOT ('passengers:auth:write' = ANY(scopes));

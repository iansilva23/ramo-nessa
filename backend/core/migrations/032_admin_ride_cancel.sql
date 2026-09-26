-- Migration 032: permissão administrativa para cancelamento de viagens.
--
-- Cancelar uma corrida é mais sensível que consultar o diretório. Operadores
-- que já possuem escrita de motoristas e leitura financeira recebem rides:write.

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'rides:write')
WHERE 'drivers:auth:write' = ANY(scopes)
  AND 'finance:read' = ANY(scopes)
  AND NOT ('rides:write' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'rides:write')
WHERE 'drivers:auth:write' = ANY(scopes)
  AND 'finance:read' = ANY(scopes)
  AND NOT ('rides:write' = ANY(scopes));

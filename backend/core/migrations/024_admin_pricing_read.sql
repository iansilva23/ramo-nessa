-- Migration 024: escopo somente leitura para o catálogo de preços.
--
-- A v1 continua estática e autoritativa no Core. Este escopo permite apenas
-- consulta administrativa; edição/versionamento ainda não são habilitados.

UPDATE admin_api_keys
SET scopes = array_append(scopes, 'pricing:read')
WHERE 'rides:read' = ANY(scopes)
  AND NOT ('pricing:read' = ANY(scopes));

UPDATE admin_users
SET scopes = array_append(scopes, 'pricing:read')
WHERE 'rides:read' = ANY(scopes)
  AND NOT ('pricing:read' = ANY(scopes));

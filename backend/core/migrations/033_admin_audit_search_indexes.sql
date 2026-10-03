-- Migration 033: índices para diretório de logs administrativos.
--
-- A trilha continua append-only. Estes índices melhoram filtros frequentes
-- por ação e por API key sem alterar o conteúdo dos eventos existentes.

CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx
  ON admin_audit_log (action, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_key_idx
  ON admin_audit_log (actor_key_id, created_at DESC, id DESC)
  WHERE actor_key_id IS NOT NULL;

-- Migration 019: auditoria administrativa com ator humano ou API key.
--
-- Registros antigos permanecem associados à API key. Novas ações podem ser
-- assinadas por usuário humano autenticado via sessão curta.

ALTER TABLE admin_audit_log
  ADD COLUMN IF NOT EXISTS actor_user_id uuid
    REFERENCES admin_users(id) ON DELETE RESTRICT;

ALTER TABLE admin_audit_log
  ALTER COLUMN actor_key_id DROP NOT NULL;

ALTER TABLE admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_actor_exactly_one;

ALTER TABLE admin_audit_log
  ADD CONSTRAINT admin_audit_log_actor_exactly_one CHECK (
    (
      actor_key_id IS NOT NULL
      AND actor_user_id IS NULL
    )
    OR
    (
      actor_key_id IS NULL
      AND actor_user_id IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_user_idx
  ON admin_audit_log (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

-- Migration 040: conta completa do passageiro.
--
-- Mantém telefone/OTP e sessão existentes, adicionando credencial por senha
-- e dados básicos de perfil na mesma identidade.

ALTER TABLE auth_identities
  ADD COLUMN IF NOT EXISTS full_name text;

ALTER TABLE auth_identities
  ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE auth_identities
  ADD COLUMN IF NOT EXISTS photo_url text;

CREATE UNIQUE INDEX IF NOT EXISTS auth_passenger_email_login_idx
  ON auth_identities (email_normalized)
  WHERE subject_type = 'passenger'
    AND email_normalized IS NOT NULL;

-- Migration 014: identidades por telefone e desafios OTP.
--
-- Passageiro pode nascer a partir de um telefone verificado.
-- Motorista precisa possuir identidade previamente provisionada/aprovada.

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY,
  subject_id text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('passenger', 'driver')),
  phone_e164 text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (subject_type, subject_id),
  UNIQUE (subject_type, phone_e164)
);

CREATE TABLE IF NOT EXISTS auth_otp_challenges (
  id uuid PRIMARY KEY,
  identity_id uuid NOT NULL REFERENCES auth_identities(id) ON DELETE CASCADE,
  code_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_otp_challenges_identity_created_idx
  ON auth_otp_challenges (identity_id, created_at DESC);

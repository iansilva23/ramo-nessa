-- Migration 045: vínculos de autenticação social do passageiro.
--
-- O telefone continua obrigatório na identidade principal. Google/Apple
-- apenas provam a identidade externa e são vinculados a uma conta já
-- confirmada por OTP.

CREATE TABLE IF NOT EXISTS auth_federated_identities (
  provider text NOT NULL
    CHECK (provider IN ('google', 'apple')),
  provider_subject text NOT NULL,
  identity_id uuid NOT NULL
    REFERENCES auth_identities(id) ON DELETE CASCADE,
  email_normalized text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (provider, provider_subject),
  UNIQUE (provider, identity_id)
);

CREATE INDEX IF NOT EXISTS auth_federated_identity_lookup_idx
  ON auth_federated_identities (identity_id);

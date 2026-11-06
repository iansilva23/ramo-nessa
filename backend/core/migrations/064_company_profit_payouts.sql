-- Migration 064: destino Pix e repasses do saldo da empresa.
--
-- Mantém o repasse da empresa separado dos saques de motoristas.
-- O snapshot da chave Pix é gravado em cada repasse para auditoria.

CREATE TABLE IF NOT EXISTS company_payout_destination (
  id smallint PRIMARY KEY CHECK (id = 1),
  pix_key_type text NOT NULL CHECK (
    pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')
  ),
  pix_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS company_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (
    status IN ('requested', 'processing', 'paid', 'failed', 'cancelled')
  ),
  idempotency_key text NOT NULL UNIQUE,
  pix_key_type text NOT NULL CHECK (
    pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')
  ),
  pix_key text NOT NULL,
  processor text,
  processor_payout_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS company_payouts_status_created_idx
  ON company_payouts (status, created_at DESC);

ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS company_payout_id uuid
    REFERENCES company_payouts(id);

CREATE INDEX IF NOT EXISTS ledger_transactions_company_payout_idx
  ON ledger_transactions (company_payout_id)
  WHERE company_payout_id IS NOT NULL;

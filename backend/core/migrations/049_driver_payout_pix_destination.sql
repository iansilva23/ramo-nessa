-- Migration 049: chave Pix do motorista e snapshot no saque.

CREATE TABLE IF NOT EXISTS driver_payout_destinations (
  driver_id text PRIMARY KEY,
  pix_key_type text NOT NULL CHECK (
    pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')
  ),
  pix_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_payouts
  ADD COLUMN IF NOT EXISTS pix_key_type text;

ALTER TABLE driver_payouts
  ADD COLUMN IF NOT EXISTS pix_key text;

ALTER TABLE driver_payouts
  DROP CONSTRAINT IF EXISTS driver_payouts_pix_key_type_check;

ALTER TABLE driver_payouts
  ADD CONSTRAINT driver_payouts_pix_key_type_check
  CHECK (
    pix_key_type IS NULL OR
    pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')
  );

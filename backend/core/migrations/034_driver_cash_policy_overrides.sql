-- Migration 034: limite individual de dívida de comissão cash por motorista.
--
-- O dinheiro continua desligado por padrão. Esta tabela apenas guarda overrides
-- para uso quando a política cash for explicitamente ativada pelo Admin.
-- O limite padrão permanece definido no Core (R$ 120 na política v1).

CREATE TABLE IF NOT EXISTS driver_cash_policy_overrides (
  driver_id text PRIMARY KEY,
  debt_limit_cents integer NOT NULL CHECK (debt_limit_cents > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_cash_policy_overrides_updated_idx
  ON driver_cash_policy_overrides (updated_at DESC);

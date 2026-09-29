-- Migration 061: prazo para decisão após busca sem motorista.
-- Se o passageiro não tentar novamente nem cancelar dentro do prazo,
-- o Core cancela a corrida e inicia o reembolso automaticamente.

ALTER TABLE operational_settings
  ADD COLUMN IF NOT EXISTS no_driver_decision_timeout_seconds integer
    NOT NULL DEFAULT 900;

ALTER TABLE operational_settings
  DROP CONSTRAINT IF EXISTS operational_settings_no_driver_decision_timeout_check;

ALTER TABLE operational_settings
  ADD CONSTRAINT operational_settings_no_driver_decision_timeout_check
  CHECK (
    no_driver_decision_timeout_seconds BETWEEN 60 AND 3600
  );

UPDATE operational_settings
SET no_driver_decision_timeout_seconds =
  COALESCE(no_driver_decision_timeout_seconds, 900)
WHERE id = 1;

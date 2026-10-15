-- Migration 055: tempo de reserva do motorista durante o pagamento.
-- Controlado pelo ADM para não exigir alteração de código/app.

ALTER TABLE operational_settings
  ADD COLUMN IF NOT EXISTS driver_payment_hold_seconds integer NOT NULL DEFAULT 90;

ALTER TABLE operational_settings
  DROP CONSTRAINT IF EXISTS operational_settings_driver_payment_hold_check;

ALTER TABLE operational_settings
  ADD CONSTRAINT operational_settings_driver_payment_hold_check
  CHECK (driver_payment_hold_seconds BETWEEN 30 AND 300);

UPDATE operational_settings
SET driver_payment_hold_seconds =
  COALESCE(driver_payment_hold_seconds, 90)
WHERE id = 1;

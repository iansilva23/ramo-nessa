-- Migration 057: Firebase Cloud Messaging como provider push nativo.
--
-- Mantém APNs/webhook legados e adiciona FCM sem reescrever registros
-- existentes. A migração é idempotente para o preflight que a executa duas vezes.

ALTER TABLE push_devices
  DROP CONSTRAINT IF EXISTS push_devices_provider_check;

ALTER TABLE push_devices
  ADD CONSTRAINT push_devices_provider_check
  CHECK (provider IN ('apns', 'webhook', 'fcm'));

-- Preparada no PR; não aplicar à VPS sem homologação e autorização.
ALTER TABLE push_devices DROP CONSTRAINT IF EXISTS push_devices_platform_check;
ALTER TABLE push_devices ADD CONSTRAINT push_devices_platform_check
  CHECK (platform IN ('android', 'ios', 'web'));

-- Clientes anteriores preservam o comportamento existente. Os novos clientes
-- enviam explicitamente a escolha do onboarding, cujo padrão é important.
ALTER TABLE push_devices ADD COLUMN IF NOT EXISTS notification_preference text NOT NULL DEFAULT 'all';
ALTER TABLE push_devices DROP CONSTRAINT IF EXISTS push_devices_notification_preference_check;
ALTER TABLE push_devices ADD CONSTRAINT push_devices_notification_preference_check
  CHECK (notification_preference IN ('important', 'all'));
ALTER TABLE push_devices DROP CONSTRAINT IF EXISTS push_devices_web_provider_check;
ALTER TABLE push_devices ADD CONSTRAINT push_devices_web_provider_check
  CHECK (platform <> 'web' OR provider = 'fcm');

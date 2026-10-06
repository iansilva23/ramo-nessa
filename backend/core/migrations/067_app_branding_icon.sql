ALTER TABLE app_auth_branding
  ADD COLUMN IF NOT EXISTS app_icon bytea,
  ADD COLUMN IF NOT EXISTS app_icon_mime_type text,
  ADD COLUMN IF NOT EXISTS app_icon_version integer NOT NULL DEFAULT 0;

ALTER TABLE app_auth_branding
  DROP CONSTRAINT IF EXISTS app_auth_branding_app_icon_version_non_negative,
  DROP CONSTRAINT IF EXISTS app_auth_branding_app_icon_consistent;

ALTER TABLE app_auth_branding
  ADD CONSTRAINT app_auth_branding_app_icon_version_non_negative
    CHECK (app_icon_version >= 0),
  ADD CONSTRAINT app_auth_branding_app_icon_consistent CHECK (
    (app_icon IS NULL AND app_icon_mime_type IS NULL)
    OR
    (app_icon IS NOT NULL AND app_icon_mime_type IN ('image/png', 'image/webp'))
  );

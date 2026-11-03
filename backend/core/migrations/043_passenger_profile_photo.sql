-- Migration 043: foto própria do perfil do passageiro.

ALTER TABLE auth_identities
  ADD COLUMN IF NOT EXISTS photo_bytes bytea,
  ADD COLUMN IF NOT EXISTS photo_mime_type text,
  ADD COLUMN IF NOT EXISTS photo_updated_at timestamptz;

ALTER TABLE auth_identities
  DROP CONSTRAINT IF EXISTS auth_identities_photo_mime_type_check;

ALTER TABLE auth_identities
  ADD CONSTRAINT auth_identities_photo_mime_type_check
  CHECK (
    photo_mime_type IS NULL
    OR photo_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  );

ALTER TABLE auth_identities
  DROP CONSTRAINT IF EXISTS auth_identities_photo_consistency_check;

ALTER TABLE auth_identities
  ADD CONSTRAINT auth_identities_photo_consistency_check
  CHECK (
    (photo_bytes IS NULL AND photo_mime_type IS NULL AND photo_updated_at IS NULL)
    OR
    (photo_bytes IS NOT NULL AND photo_mime_type IS NOT NULL AND photo_updated_at IS NOT NULL)
  );

-- Migration 041: foto pública e reputação do perfil do motorista.

ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS photo_bytes bytea,
  ADD COLUMN IF NOT EXISTS photo_mime_type text,
  ADD COLUMN IF NOT EXISTS photo_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rating_sum integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

ALTER TABLE driver_profiles
  DROP CONSTRAINT IF EXISTS driver_profiles_photo_mime_type_check;

ALTER TABLE driver_profiles
  ADD CONSTRAINT driver_profiles_photo_mime_type_check
  CHECK (
    photo_mime_type IS NULL
    OR photo_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  );

ALTER TABLE driver_profiles
  DROP CONSTRAINT IF EXISTS driver_profiles_photo_consistency_check;

ALTER TABLE driver_profiles
  ADD CONSTRAINT driver_profiles_photo_consistency_check
  CHECK (
    (photo_bytes IS NULL AND photo_mime_type IS NULL AND photo_updated_at IS NULL)
    OR
    (photo_bytes IS NOT NULL AND photo_mime_type IS NOT NULL AND photo_updated_at IS NOT NULL)
  );

ALTER TABLE driver_profiles
  DROP CONSTRAINT IF EXISTS driver_profiles_rating_check;

ALTER TABLE driver_profiles
  ADD CONSTRAINT driver_profiles_rating_check
  CHECK (
    rating_sum >= 0
    AND rating_count >= 0
    AND rating_sum <= rating_count * 5
  );

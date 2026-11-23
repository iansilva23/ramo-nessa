-- A vehicle row is updated in place. A registration revision identifies
-- which vehicle details were in effect when a set of photos was taken.
ALTER TABLE driver_vehicles
  ADD COLUMN photo_verification_revision integer NOT NULL DEFAULT 1
    CHECK (photo_verification_revision > 0),
  ADD CONSTRAINT driver_vehicles_photo_owner_key UNIQUE (driver_id, id);

CREATE FUNCTION update_driver_vehicle_photo_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.plate_normalized, NEW.make, NEW.model, NEW.model_year, NEW.color)
     IS DISTINCT FROM
     ROW(OLD.plate_normalized, OLD.make, OLD.model, OLD.model_year, OLD.color) THEN
    NEW.photo_verification_revision := OLD.photo_verification_revision + 1;
  ELSE
    NEW.photo_verification_revision := OLD.photo_verification_revision;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER driver_vehicle_photo_revision
  BEFORE UPDATE ON driver_vehicles
  FOR EACH ROW EXECUTE FUNCTION update_driver_vehicle_photo_revision();

CREATE TABLE driver_verification_photos (
  id uuid PRIMARY KEY,
  driver_id text NOT NULL REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
  vehicle_id uuid,
  vehicle_revision integer,
  photo_type text NOT NULL CHECK (
    photo_type IN ('portrait', 'vehicle_front', 'vehicle_rear', 'vehicle_left', 'vehicle_right')
  ),
  storage_key text NOT NULL UNIQUE CHECK (
    storage_key ~ '^driver-verification/[0-9a-f-]{36}/photo[.](jpg|webp)$'
  ),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/webp')),
  size_bytes integer NOT NULL CHECK (
    size_bytes BETWEEN 1 AND CASE
      WHEN photo_type = 'portrait' THEN 262144
      WHEN photo_type IN ('vehicle_left', 'vehicle_right') THEN 307200
      ELSE 512000
    END
  ),
  pixel_width integer NOT NULL CHECK (pixel_width > 0),
  pixel_height integer NOT NULL CHECK (pixel_height > 0),
  status text NOT NULL CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_kind text CHECK (reviewed_by_kind IN ('api_key', 'user')),
  reviewed_by_id text,
  rejection_reason text,
  FOREIGN KEY (driver_id, vehicle_id) REFERENCES driver_vehicles(driver_id, id) ON DELETE CASCADE,
  CHECK (
    (photo_type = 'portrait' AND vehicle_id IS NULL AND vehicle_revision IS NULL)
    OR (photo_type <> 'portrait' AND vehicle_id IS NOT NULL AND vehicle_revision > 0
        AND vehicle_revision IS NOT NULL)
  ),
  CHECK (
    greatest(pixel_width, pixel_height) <= CASE
      WHEN photo_type = 'portrait' THEN 512
      WHEN photo_type IN ('vehicle_left', 'vehicle_right') THEN 1024
      ELSE 1280
    END
  ),
  CHECK (
    (status = 'draft' AND submitted_at IS NULL)
    OR (status <> 'draft' AND submitted_at IS NOT NULL AND submitted_at >= created_at)
  ),
  CHECK (
    (status IN ('draft', 'pending') AND reviewed_at IS NULL
      AND reviewed_by_kind IS NULL AND reviewed_by_id IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_at IS NOT NULL
      AND reviewed_at >= submitted_at AND reviewed_by_kind IS NOT NULL
      AND reviewed_by_id IS NOT NULL)
  ),
  CHECK (
    (status = 'rejected' AND rejection_reason IS NOT NULL
      AND char_length(btrim(rejection_reason)) BETWEEN 1 AND 1000)
    OR (status <> 'rejected' AND rejection_reason IS NULL)
  )
);

CREATE UNIQUE INDEX driver_photo_current_portrait_idx
  ON driver_verification_photos (driver_id)
  WHERE photo_type = 'portrait' AND is_current;

CREATE UNIQUE INDEX driver_photo_current_vehicle_idx
  ON driver_verification_photos (vehicle_id, vehicle_revision, photo_type)
  WHERE photo_type <> 'portrait' AND is_current;

CREATE INDEX driver_photo_review_queue_idx
  ON driver_verification_photos (submitted_at, id)
  WHERE status = 'pending' AND is_current;

CREATE INDEX driver_photo_history_idx
  ON driver_verification_photos (driver_id, photo_type, created_at DESC, id);

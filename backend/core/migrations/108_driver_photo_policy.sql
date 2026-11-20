CREATE TABLE driver_photo_policy (
  revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  starts_at timestamptz,
  deadline_at timestamptz,
  review_grace_hours integer NOT NULL CHECK (review_grace_hours BETWEEN 0 AND 720),
  changed_at timestamptz NOT NULL DEFAULT now(),
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'api_key')),
  actor_id text NOT NULL,
  CHECK ((starts_at IS NULL AND deadline_at IS NULL)
    OR (starts_at IS NOT NULL AND deadline_at IS NOT NULL AND deadline_at > starts_at))
);

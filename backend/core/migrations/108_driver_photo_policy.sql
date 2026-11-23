CREATE TABLE driver_photo_policy (
  revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  required boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'api_key')),
  actor_id text NOT NULL
);

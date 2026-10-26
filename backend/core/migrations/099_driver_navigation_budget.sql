-- Metadata only: never stores Google route geometry or changes trip/financial state.
CREATE TABLE driver_navigation_control (
 ride_id uuid PRIMARY KEY REFERENCES rides(id),
 mode text NOT NULL DEFAULT 'internal' CHECK(mode IN ('internal','paused','own','external')),
 recalculations integer NOT NULL DEFAULT 0 CHECK(recalculations BETWEEN 0 AND 4),
 pickup_requested boolean NOT NULL DEFAULT false,
 dropoff_requested boolean NOT NULL DEFAULT false,
 last_request_at timestamptz,
 in_flight_token uuid,
 in_flight_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE driver_navigation_requests (
 id uuid PRIMARY KEY,
 ride_id uuid NOT NULL REFERENCES rides(id),
 stage text NOT NULL CHECK(stage IN ('pickup','dropoff')),
 reason text NOT NULL CHECK(reason IN ('initial','off_route','resume')),
 outcome text NOT NULL DEFAULT 'reserved' CHECK(outcome IN ('reserved','success','provider_error')),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX driver_navigation_requests_ride ON driver_navigation_requests(ride_id,created_at);
CREATE TABLE driver_navigation_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0)
);
INSERT INTO driver_navigation_policy(singleton) VALUES(true);
CREATE TABLE driver_navigation_policy_audit (
 id uuid PRIMARY KEY,
 enabled boolean NOT NULL,
 revision integer NOT NULL,
 actor_kind text NOT NULL,
 actor_id text NOT NULL,
 actor_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

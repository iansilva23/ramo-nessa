-- Additive driver credentials; existing phone identities and sessions are preserved.
CREATE TABLE IF NOT EXISTS driver_login_credentials (
 identity_id uuid PRIMARY KEY REFERENCES auth_identities(id) ON DELETE CASCADE,
 username_normalized text NOT NULL UNIQUE CHECK(username_normalized ~ '^[a-z][a-z0-9._-]{2,31}$'),
 email_normalized text NOT NULL UNIQUE CHECK(email_normalized=lower(email_normalized)),
 password_hash text NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS driver_password_reset_requests (
 challenge_id uuid PRIMARY KEY REFERENCES auth_otp_challenges(id) ON DELETE CASCADE,
 identity_id uuid NOT NULL REFERENCES driver_login_credentials(identity_id) ON DELETE CASCADE,
 credential_version integer NOT NULL, expires_at timestamptz NOT NULL,
 consumed_at timestamptz, created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS driver_password_reset_identity_idx ON driver_password_reset_requests(identity_id,created_at DESC);

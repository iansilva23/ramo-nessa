-- Retire only challenge/reset records used by the removed phone authentication.
-- Historical migrations stay immutable for existing checksum histories.
DROP TABLE IF EXISTS driver_password_reset_requests;
DROP TABLE IF EXISTS auth_otp_challenges;
ALTER TABLE auth_otp_rate_limits RENAME TO auth_password_rate_limits;

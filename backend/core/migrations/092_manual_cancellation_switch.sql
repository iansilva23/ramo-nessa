-- Keep the new cancellation system dormant until explicitly enabled in ADM.
ALTER TABLE ride_cancellation_policy
 ADD COLUMN system_enabled boolean NOT NULL DEFAULT false;

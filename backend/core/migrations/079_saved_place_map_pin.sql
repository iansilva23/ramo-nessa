ALTER TABLE passenger_saved_places ADD COLUMN address_details jsonb;
ALTER TABLE rides ADD COLUMN pickup_instructions text;
ALTER TABLE rides ADD COLUMN dropoff_instructions text;

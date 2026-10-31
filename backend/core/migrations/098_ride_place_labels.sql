-- Display metadata only. Historical rides, coordinates and pricing references stay intact.
ALTER TABLE rides ADD COLUMN pickup_label varchar(240), ADD COLUMN dropoff_label varchar(240);

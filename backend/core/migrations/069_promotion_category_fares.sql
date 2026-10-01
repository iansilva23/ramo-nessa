-- Preserve existing campaign constraints and legacy single-category fares.
ALTER TABLE promotion_campaigns
  ADD COLUMN IF NOT EXISTS fixed_driver_fares_by_category jsonb;

CREATE OR REPLACE FUNCTION valid_promotion_category_fares(fares jsonb, allowed text[])
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item record;
BEGIN
  IF fares IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(fares) <> 'object' OR fares = '{}'::jsonb THEN RETURN false; END IF;
  FOR item IN SELECT * FROM jsonb_each(fares) LOOP
    IF NOT (item.key = ANY(ARRAY['moto','delivery','car','comfort_black','buggy']))
       OR NOT (item.key = ANY(allowed)) OR jsonb_typeof(item.value) <> 'number' THEN RETURN false; END IF;
    IF (item.value::text)::numeric NOT BETWEEN 1 AND 100000000
       OR trunc((item.value::text)::numeric) <> (item.value::text)::numeric THEN RETURN false; END IF;
  END LOOP;
  RETURN cardinality(allowed) > 0 AND fares ?& allowed;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'promotion_campaigns'::regclass
      AND conname = 'promotion_category_fares_valid') THEN
    ALTER TABLE promotion_campaigns ADD CONSTRAINT promotion_category_fares_valid
      CHECK (valid_promotion_category_fares(fixed_driver_fares_by_category, categories)
        AND (fixed_driver_fares_by_category IS NULL OR kind = 'fixed_driver_fare'));
  END IF;
END $$;

ALTER TABLE rides ADD COLUMN cash_tendered_cents integer
  CHECK (cash_tendered_cents IS NULL OR
    (payment_method IS NOT DISTINCT FROM 'cash' AND cash_tendered_cents BETWEEN 1 AND 9999999));

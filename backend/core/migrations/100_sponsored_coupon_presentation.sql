-- Additive campaign options; existing prices, redemptions and ride snapshots stay intact.
ALTER TABLE promotion_campaigns DROP CONSTRAINT IF EXISTS promotion_campaigns_kind_check;
ALTER TABLE promotion_campaigns ADD CONSTRAINT promotion_campaigns_kind_check
  CHECK (kind IN ('wallet_credit','fixed_discount','percent_discount','free_ride','fixed_driver_fare','company_paid'));
ALTER TABLE promotion_campaigns ADD COLUMN IF NOT EXISTS budget_cents integer
  CHECK (budget_cents > 0 AND budget_cents <= 100000000);
ALTER TABLE promotion_campaigns ADD COLUMN IF NOT EXISTS driver_presentation jsonb;

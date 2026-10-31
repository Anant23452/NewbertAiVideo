-- Up Migration
-- Upgrade only the previous default ceilings; retain explicit custom limits.
UPDATE newbert.usage_buckets SET limit_units=52428800 WHERE resource='storage_bytes' AND limit_units=10485760;
UPDATE newbert.platform_budgets SET limit_units=524288000 WHERE resource='storage_bytes' AND limit_units=104857600;
-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration';END $$;

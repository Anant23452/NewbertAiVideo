-- Up Migration
CREATE FUNCTION newbert.platform_capacity() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN NOT p.admission_enabled OR NOT p.processing_enabled THEN 'paused'
    WHEN coalesce(b.used_units+b.reserved_units,0)>=least(coalesce(b.limit_units,p.platform_daily_jobs),p.platform_daily_jobs) THEN 'queued'
    ELSE 'available' END
  FROM newbert.processing_policy p LEFT JOIN newbert.platform_budgets b ON b.resource='generation_count'
    AND b.period_start=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  WHERE p.singleton
$$;
REVOKE ALL ON FUNCTION newbert.platform_capacity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION newbert.platform_capacity() TO newbert_runtime;

-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration; use a reviewed forward fix.'; END $$;

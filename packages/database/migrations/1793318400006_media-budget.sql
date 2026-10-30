-- Up Migration
ALTER TABLE newbert.processing_policy ADD COLUMN platform_storage_bytes_limit bigint NOT NULL DEFAULT 104857600 CHECK(platform_storage_bytes_limit>=0);
CREATE FUNCTION newbert.charge_storage(target_artifact uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a newbert.artifacts; b newbert.platform_budgets; cap bigint;
BEGIN
  SELECT * INTO a FROM newbert.artifacts WHERE id=target_artifact;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM newbert.generation_jobs j WHERE j.id=a.job_id AND j.state='running' AND j.lease_expires_at>now()) THEN RAISE EXCEPTION 'Invalid media commit'; END IF;
  SELECT platform_storage_bytes_limit INTO cap FROM newbert.processing_policy WHERE singleton FOR SHARE;
  INSERT INTO newbert.platform_budgets(id,resource,period_start,period_end,limit_units)
    VALUES(gen_random_uuid(),'storage_bytes','1970-01-01Z','9999-01-01Z',cap) ON CONFLICT(resource,period_start) DO NOTHING;
  SELECT * INTO b FROM newbert.platform_budgets WHERE resource='storage_bytes' AND period_start='1970-01-01Z' FOR UPDATE;
  IF b.used_units+a.byte_size>least(b.limit_units,cap) THEN RAISE EXCEPTION 'STORAGE_CAPACITY'; END IF;
  UPDATE newbert.platform_budgets SET used_units=used_units+a.byte_size WHERE id=b.id;
END $$;
REVOKE ALL ON FUNCTION newbert.charge_storage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION newbert.charge_storage(uuid) TO newbert_worker;

-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration; use a reviewed forward fix.'; END $$;

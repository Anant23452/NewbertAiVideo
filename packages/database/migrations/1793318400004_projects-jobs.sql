-- Up Migration
GRANT INSERT ON newbert.projects, newbert.project_drafts, newbert.project_versions,
  newbert.generation_jobs, newbert.usage_buckets, newbert.usage_reservations,
  newbert.idempotency_records, newbert.outbox_events, newbert.audit_events TO newbert_runtime;
GRANT UPDATE(title,status,revision,next_version_number,updated_at) ON newbert.projects TO newbert_runtime;
GRANT UPDATE(content,revision,updated_at) ON newbert.project_drafts TO newbert_runtime;
GRANT UPDATE ON newbert.generation_jobs,newbert.usage_buckets,newbert.usage_reservations,
  newbert.idempotency_records TO newbert_runtime;
GRANT SELECT ON newbert.outbox_events TO newbert_runtime;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='newbert_worker') THEN
    CREATE ROLE newbert_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='newbert_worker' AND
    (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolcanlogin)) THEN
    RAISE EXCEPTION 'Unsafe worker role';
  END IF;
END $$;
GRANT USAGE ON SCHEMA newbert TO newbert_worker;
GRANT SELECT ON newbert.projects,newbert.project_drafts,newbert.project_versions TO newbert_worker;
GRANT SELECT,INSERT,UPDATE ON newbert.generation_jobs,newbert.workspace_dispatch,newbert.job_attempts,
  newbert.artifacts,newbert.usage_buckets,newbert.usage_reservations,newbert.usage_entries,
  newbert.outbox_events TO newbert_worker;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['projects','project_drafts','project_versions','generation_jobs','workspace_dispatch',
    'job_attempts','artifacts','usage_buckets','usage_reservations','usage_entries','outbox_events'] LOOP
    EXECUTE format('CREATE POLICY worker_access ON newbert.%I TO newbert_worker USING (true) WITH CHECK (true)',tab);
  END LOOP;
END $$;

-- One operator-controlled policy; browser/runtime cannot alter or read platform budgets.
CREATE TABLE newbert.processing_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  admission_enabled boolean NOT NULL DEFAULT true,
  processing_enabled boolean NOT NULL DEFAULT true,
  workspace_daily_jobs integer NOT NULL DEFAULT 3 CHECK(workspace_daily_jobs BETWEEN 0 AND 100),
  platform_daily_jobs integer NOT NULL DEFAULT 20 CHECK(platform_daily_jobs BETWEEN 0 AND 10000),
  global_concurrency integer NOT NULL DEFAULT 2 CHECK(global_concurrency BETWEEN 1 AND 20),
  workspace_concurrency integer NOT NULL DEFAULT 1 CHECK(workspace_concurrency BETWEEN 1 AND 5),
  paid_providers_enabled boolean NOT NULL DEFAULT false,
  provider_credit_limit bigint NOT NULL DEFAULT 0 CHECK(provider_credit_limit>=0),
  narration_ms_limit bigint NOT NULL DEFAULT 0 CHECK(narration_ms_limit>=0),
  render_ms_limit bigint NOT NULL DEFAULT 0 CHECK(render_ms_limit>=0),
  storage_bytes_limit bigint NOT NULL DEFAULT 10485760 CHECK(storage_bytes_limit>=0)
);
INSERT INTO newbert.processing_policy(singleton) VALUES(true);
GRANT SELECT ON newbert.processing_policy TO newbert_runtime,newbert_worker;
CREATE TABLE newbert.worker_heartbeats(id text PRIMARY KEY,last_seen timestamptz NOT NULL DEFAULT now(),online boolean NOT NULL DEFAULT true);
GRANT SELECT ON newbert.worker_heartbeats TO newbert_runtime;
GRANT SELECT,INSERT,UPDATE ON newbert.worker_heartbeats TO newbert_worker;

CREATE FUNCTION newbert.reserve_platform(target_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p newbert.processing_policy; b newbert.platform_budgets; workspace uuid;
BEGIN
  workspace:=newbert.current_workspace_id();
  IF workspace IS NULL OR NOT EXISTS(SELECT 1 FROM newbert.generation_jobs WHERE id=target_job AND workspace_id=workspace AND state='queued') THEN
    RAISE EXCEPTION 'Invalid job reservation' USING ERRCODE='23514';
  END IF;
  SELECT * INTO p FROM newbert.processing_policy WHERE singleton FOR SHARE;
  IF NOT p.admission_enabled THEN RAISE EXCEPTION 'ADMISSION_PAUSED' USING ERRCODE='P0001'; END IF;
  INSERT INTO newbert.platform_budgets(id,resource,period_start,period_end,limit_units)
    VALUES(gen_random_uuid(),'generation_count',date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
      (date_trunc('day',now() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC',p.platform_daily_jobs)
    ON CONFLICT(resource,period_start) DO NOTHING;
  SELECT * INTO b FROM newbert.platform_budgets WHERE resource='generation_count'
    AND period_start=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' FOR UPDATE;
  IF EXISTS(SELECT 1 FROM newbert.platform_reservations WHERE job_id=target_job) THEN RETURN; END IF;
  IF b.used_units+b.reserved_units+1>least(b.limit_units,p.platform_daily_jobs) THEN
    RAISE EXCEPTION 'PLATFORM_CAPACITY' USING ERRCODE='P0001';
  END IF;
  UPDATE newbert.platform_budgets SET reserved_units=reserved_units+1 WHERE id=b.id;
  INSERT INTO newbert.platform_reservations(id,job_id,budget_id,event_key,reserved_units,status)
    VALUES(gen_random_uuid(),target_job,b.id,target_job::text,1,'reserved');
END $$;
REVOKE ALL ON FUNCTION newbert.reserve_platform(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION newbert.reserve_platform(uuid) TO newbert_runtime;

-- Runtime may release only a cancelled own job. Workers settle actual terminal work.
CREATE FUNCTION newbert.settle_platform(target_job uuid,actual bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r newbert.platform_reservations; j newbert.generation_jobs;
BEGIN
  SELECT * INTO j FROM newbert.generation_jobs WHERE id=target_job FOR UPDATE;
  IF NOT FOUND OR actual NOT IN (0,1) THEN RAISE EXCEPTION 'Invalid settlement'; END IF;
  IF NOT pg_has_role(session_user,'newbert_worker','member') AND
    (j.workspace_id IS DISTINCT FROM newbert.current_workspace_id() OR j.state<>'cancelled' OR actual<>0) THEN
    RAISE EXCEPTION 'Invalid settlement';
  END IF;
  IF j.state NOT IN ('succeeded','failed','cancelled') THEN RAISE EXCEPTION 'Nonterminal settlement'; END IF;
  SELECT * INTO r FROM newbert.platform_reservations WHERE job_id=target_job FOR UPDATE;
  IF NOT FOUND OR r.status<>'reserved' THEN RETURN; END IF;
  UPDATE newbert.platform_budgets SET reserved_units=reserved_units-r.reserved_units,used_units=used_units+actual WHERE id=r.budget_id;
  UPDATE newbert.platform_reservations SET status=CASE WHEN actual=0 THEN 'released' ELSE 'settled' END,actual_units=actual WHERE id=r.id;
END $$;
REVOKE ALL ON FUNCTION newbert.settle_platform(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION newbert.settle_platform(uuid,bigint) TO newbert_runtime,newbert_worker;
CREATE INDEX job_attempts_uncertain ON newbert.job_attempts(job_id) WHERE state IN ('prepared','submitted','unknown');

-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration; use a reviewed forward fix.'; END $$;

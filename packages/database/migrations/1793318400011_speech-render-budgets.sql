-- Up Migration
ALTER TABLE newbert.processing_policy ADD COLUMN production_enabled boolean NOT NULL DEFAULT true;
CREATE TABLE newbert.production_limits(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),max_duration_ms bigint NOT NULL DEFAULT 120000,max_characters integer NOT NULL DEFAULT 1600,workspace_characters bigint NOT NULL DEFAULT 2000,global_characters bigint NOT NULL DEFAULT 4000,workspace_narration_ms bigint NOT NULL DEFAULT 240000,global_narration_ms bigint NOT NULL DEFAULT 600000,workspace_render_ms bigint NOT NULL DEFAULT 240000,global_render_ms bigint NOT NULL DEFAULT 600000);
INSERT INTO newbert.production_limits(singleton) VALUES(true);
GRANT SELECT ON newbert.production_limits TO newbert_runtime,newbert_worker;
CREATE TABLE newbert.speech_calls(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES newbert.workspaces(id),job_id uuid NOT NULL REFERENCES newbert.generation_jobs(id),attempt_id uuid NOT NULL UNIQUE REFERENCES newbert.job_attempts(id),characters integer NOT NULL CHECK(characters>0),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE newbert.speech_calls ENABLE ROW LEVEL SECURITY;ALTER TABLE newbert.speech_calls FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON newbert.speech_calls USING(workspace_id=newbert.current_workspace_id()) WITH CHECK(workspace_id=newbert.current_workspace_id());
CREATE POLICY worker_access ON newbert.speech_calls TO newbert_worker USING(true) WITH CHECK(true);
GRANT SELECT ON newbert.speech_calls TO newbert_runtime;GRANT SELECT,INSERT ON newbert.speech_calls TO newbert_worker;
-- Upgrade previous defaults independently; retain custom operator ceilings.
UPDATE newbert.processing_policy SET
 storage_bytes_limit=CASE WHEN storage_bytes_limit=10485760 THEN 52428800 ELSE storage_bytes_limit END,
 platform_storage_bytes_limit=CASE WHEN platform_storage_bytes_limit=104857600 THEN 524288000 ELSE platform_storage_bytes_limit END;
GRANT UPDATE(latest_output_artifact_id,revision,updated_at) ON newbert.projects TO newbert_worker;

CREATE FUNCTION newbert.reserve_media_resource(target_job uuid,resource_name text,units bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j newbert.generation_jobs; l newbert.production_limits; w newbert.usage_buckets; b newbert.platform_budgets; wc bigint; gc bigint; start_at timestamptz;
BEGIN
 SELECT * INTO j FROM newbert.generation_jobs WHERE id=target_job FOR UPDATE;
 IF NOT FOUND OR j.kind<>'produce' OR units<0 OR j.state NOT IN ('queued','running','paused') OR (NOT pg_has_role(session_user,'newbert_worker','member') AND j.workspace_id IS DISTINCT FROM newbert.current_workspace_id()) THEN RAISE EXCEPTION 'Invalid media reservation';END IF;
 SELECT * INTO l FROM newbert.production_limits WHERE singleton;
 IF resource_name='provider_credits' THEN wc:=l.workspace_characters;gc:=l.global_characters;
 ELSIF resource_name='narration_ms' THEN wc:=l.workspace_narration_ms;gc:=l.global_narration_ms;
 ELSIF resource_name='render_ms' THEN wc:=l.workspace_render_ms;gc:=l.global_render_ms;
 ELSE RAISE EXCEPTION 'Invalid media resource';END IF;
 start_at:=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF EXISTS(SELECT 1 FROM newbert.usage_reservations r JOIN newbert.usage_buckets u ON u.id=r.bucket_id WHERE r.job_id=j.id AND r.reservation_key='production' AND u.resource=resource_name) THEN RETURN;END IF;
 INSERT INTO newbert.usage_buckets(id,workspace_id,resource,period_start,period_end,limit_units) VALUES(gen_random_uuid(),j.workspace_id,resource_name,start_at,start_at+interval '1 day',wc) ON CONFLICT(workspace_id,resource,period_start) DO NOTHING;
 SELECT * INTO w FROM newbert.usage_buckets WHERE workspace_id=j.workspace_id AND resource=resource_name AND period_start=start_at FOR UPDATE;
 INSERT INTO newbert.platform_budgets(id,resource,period_start,period_end,limit_units) VALUES(gen_random_uuid(),resource_name,start_at,start_at+interval '1 day',gc) ON CONFLICT(resource,period_start) DO NOTHING;
 SELECT * INTO b FROM newbert.platform_budgets WHERE resource=resource_name AND period_start=start_at FOR UPDATE;
 IF w.used_units+w.reserved_units+units>least(w.limit_units,wc) OR b.used_units+b.reserved_units+units>least(b.limit_units,gc) THEN RAISE EXCEPTION 'MEDIA_ALLOWANCE_EXHAUSTED';END IF;
 UPDATE newbert.usage_buckets SET reserved_units=reserved_units+units WHERE id=w.id;UPDATE newbert.platform_budgets SET reserved_units=reserved_units+units WHERE id=b.id;
 INSERT INTO newbert.usage_reservations(id,workspace_id,job_id,bucket_id,reservation_key,reserved_units) VALUES(gen_random_uuid(),j.workspace_id,j.id,w.id,'production',units);
 INSERT INTO newbert.platform_reservations(id,job_id,budget_id,event_key,reserved_units,status) VALUES(gen_random_uuid(),j.id,b.id,j.id::text||':'||resource_name,units,'reserved');
END $$;
REVOKE ALL ON FUNCTION newbert.reserve_media_resource(uuid,text,bigint) FROM PUBLIC;GRANT EXECUTE ON FUNCTION newbert.reserve_media_resource(uuid,text,bigint) TO newbert_runtime,newbert_worker;

CREATE FUNCTION newbert.settle_media_resource(target_job uuid,resource_name text,actual bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j newbert.generation_jobs; r newbert.usage_reservations; p newbert.platform_reservations;
BEGIN
 SELECT * INTO j FROM newbert.generation_jobs WHERE id=target_job FOR UPDATE;
 IF NOT FOUND OR actual<0 OR resource_name NOT IN ('provider_credits','narration_ms','render_ms') OR (NOT pg_has_role(session_user,'newbert_worker','member') AND (j.workspace_id IS DISTINCT FROM newbert.current_workspace_id() OR j.state<>'cancelled' OR actual<>0)) THEN RAISE EXCEPTION 'Invalid media settlement';END IF;
 SELECT ur.* INTO r FROM newbert.usage_reservations ur JOIN newbert.usage_buckets b ON b.id=ur.bucket_id WHERE ur.job_id=j.id AND ur.reservation_key='production' AND b.resource=resource_name FOR UPDATE OF ur;
 IF NOT FOUND OR r.status<>'reserved' THEN RETURN;END IF;
 SELECT * INTO p FROM newbert.platform_reservations WHERE event_key=j.id::text||':'||resource_name FOR UPDATE;
 UPDATE newbert.usage_buckets SET reserved_units=reserved_units-r.reserved_units,used_units=used_units+actual WHERE id=r.bucket_id;
 UPDATE newbert.platform_budgets SET reserved_units=reserved_units-p.reserved_units,used_units=used_units+actual WHERE id=p.budget_id;
 UPDATE newbert.usage_reservations SET actual_units=actual,status=CASE WHEN actual=0 THEN 'released' ELSE 'settled' END,settled_at=now() WHERE id=r.id;
 UPDATE newbert.platform_reservations SET actual_units=actual,status=CASE WHEN actual=0 THEN 'released' ELSE 'settled' END WHERE id=p.id;
 IF actual>0 THEN INSERT INTO newbert.usage_entries(id,workspace_id,reservation_id,event_key,entry_type,units_delta,reason_code) VALUES(gen_random_uuid(),j.workspace_id,r.id,j.id::text||':'||resource_name,'incurred',actual,CASE WHEN resource_name='provider_credits' THEN 'submitted_speech_characters' ELSE 'processed_media_ms' END) ON CONFLICT(workspace_id,event_key) DO NOTHING;END IF;
END $$;
REVOKE ALL ON FUNCTION newbert.settle_media_resource(uuid,text,bigint) FROM PUBLIC;GRANT EXECUTE ON FUNCTION newbert.settle_media_resource(uuid,text,bigint) TO newbert_runtime,newbert_worker;

CREATE OR REPLACE FUNCTION newbert.settle_platform(target_job uuid,actual bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r newbert.platform_reservations;j newbert.generation_jobs;
BEGIN SELECT * INTO j FROM newbert.generation_jobs WHERE id=target_job FOR UPDATE;
IF NOT FOUND OR actual NOT IN(0,1) OR j.state NOT IN('succeeded','failed','cancelled') OR (NOT pg_has_role(session_user,'newbert_worker','member') AND (j.workspace_id IS DISTINCT FROM newbert.current_workspace_id() OR j.state<>'cancelled' OR actual<>0)) THEN RAISE EXCEPTION 'Invalid settlement';END IF;
SELECT * INTO r FROM newbert.platform_reservations WHERE event_key=target_job::text FOR UPDATE;IF NOT FOUND OR r.status<>'reserved' THEN RETURN;END IF;
UPDATE newbert.platform_budgets SET reserved_units=reserved_units-r.reserved_units,used_units=used_units+actual WHERE id=r.budget_id;UPDATE newbert.platform_reservations SET actual_units=actual,status=CASE WHEN actual=0 THEN 'released' ELSE 'settled' END WHERE id=r.id;
END $$;
-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration';END $$;

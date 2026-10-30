-- Up Migration
CREATE FUNCTION newbert.auto_apply_plan(target_job uuid,owner_id text,fence bigint,content jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j newbert.generation_jobs; v newbert.project_versions;
BEGIN
 SELECT * INTO j FROM newbert.generation_jobs WHERE id=target_job AND state='running' AND lease_owner=owner_id AND lease_token=fence AND lease_expires_at>now() AND cancel_requested_at IS NULL FOR UPDATE;
 IF NOT FOUND OR j.output_artifact_id IS NULL THEN RETURN false; END IF;
 SELECT * INTO v FROM newbert.project_versions WHERE id=j.version_id;
 IF v.mode<>'automatic' OR content->'brief' IS DISTINCT FROM v.input_snapshot->'brief' THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM newbert.claims WHERE version_id=v.id AND blocking AND status<>'supported') THEN RETURN false; END IF;
 PERFORM 1 FROM newbert.projects WHERE id=j.project_id AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE newbert.project_drafts SET content=auto_apply_plan.content,revision=revision+1,updated_at=now(),planning_version_id=v.id,planning_artifact_id=j.output_artifact_id
 WHERE project_id=j.project_id AND revision=v.source_draft_revision AND project_drafts.content=v.input_snapshot;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE newbert.projects SET revision=revision+1,updated_at=now() WHERE id=j.project_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION newbert.auto_apply_plan(uuid,text,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION newbert.auto_apply_plan(uuid,text,bigint,jsonb) TO newbert_worker;
-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration'; END $$;

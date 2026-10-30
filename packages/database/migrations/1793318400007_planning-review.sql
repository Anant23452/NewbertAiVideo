-- Up Migration
GRANT INSERT ON newbert.discussion_messages TO newbert_runtime;
GRANT INSERT ON newbert.sources,newbert.claims,newbert.claim_sources,newbert.discussion_messages TO newbert_worker;
DO $$ DECLARE tab text; BEGIN FOREACH tab IN ARRAY ARRAY['sources','claims','claim_sources','discussion_messages'] LOOP
 EXECUTE format('CREATE POLICY worker_access ON newbert.%I TO newbert_worker USING (true) WITH CHECK (true)',tab);
 GRANT SELECT ON newbert.sources,newbert.claims,newbert.claim_sources,newbert.discussion_messages TO newbert_worker;
END LOOP; END $$;
CREATE TABLE newbert.planning_calls(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES newbert.workspaces(id),attempt_id uuid NOT NULL UNIQUE REFERENCES newbert.job_attempts(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE newbert.storyboard_approvals(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES newbert.workspaces(id),project_id uuid NOT NULL REFERENCES newbert.projects(id),draft_revision bigint NOT NULL,content_hash text NOT NULL,actor_id uuid NOT NULL REFERENCES newbert.app_users(id),reviewed_claim_ids uuid[] NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,draft_revision));
DO $$ DECLARE tab text; BEGIN FOREACH tab IN ARRAY ARRAY['planning_calls','storyboard_approvals'] LOOP
 EXECUTE format('ALTER TABLE newbert.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE newbert.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY tenant_isolation ON newbert.%I USING (workspace_id=newbert.current_workspace_id()) WITH CHECK (workspace_id=newbert.current_workspace_id())',tab);
END LOOP; END $$;
CREATE POLICY worker_access ON newbert.planning_calls TO newbert_worker USING(true) WITH CHECK(true);
GRANT SELECT ON newbert.planning_calls,newbert.storyboard_approvals TO newbert_runtime;
GRANT INSERT ON newbert.storyboard_approvals TO newbert_runtime;
GRANT SELECT,INSERT ON newbert.planning_calls TO newbert_worker;
ALTER TABLE newbert.project_drafts ADD COLUMN planning_version_id uuid REFERENCES newbert.project_versions(id);
GRANT UPDATE(planning_version_id) ON newbert.project_drafts TO newbert_runtime;
-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration'; END $$;

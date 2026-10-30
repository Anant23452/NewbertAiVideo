-- Up Migration
ALTER TABLE newbert.project_drafts ADD COLUMN planning_artifact_id uuid;
ALTER TABLE newbert.project_drafts ADD CONSTRAINT draft_planning_artifact_same_project
 FOREIGN KEY(workspace_id,project_id,planning_artifact_id) REFERENCES newbert.artifacts(workspace_id,project_id,id);
ALTER TABLE newbert.storyboard_approvals ADD CONSTRAINT approval_same_project
 FOREIGN KEY(workspace_id,project_id) REFERENCES newbert.projects(workspace_id,id);
GRANT UPDATE(planning_artifact_id) ON newbert.project_drafts TO newbert_runtime;
-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration'; END $$;

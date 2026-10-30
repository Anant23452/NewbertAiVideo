-- Up Migration
ALTER TABLE newbert.storyboard_approvals ADD COLUMN version_id uuid;
ALTER TABLE newbert.storyboard_approvals ADD COLUMN planning_version_id uuid;
ALTER TABLE newbert.storyboard_approvals ADD CONSTRAINT approved_version_same_project
 FOREIGN KEY(workspace_id,project_id,version_id) REFERENCES newbert.project_versions(workspace_id,project_id,id);
ALTER TABLE newbert.storyboard_approvals ADD CONSTRAINT approval_evidence_same_project
 FOREIGN KEY(workspace_id,project_id,planning_version_id) REFERENCES newbert.project_versions(workspace_id,project_id,id);
-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration'; END $$;

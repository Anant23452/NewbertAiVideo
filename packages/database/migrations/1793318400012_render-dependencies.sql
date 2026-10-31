-- Up Migration
GRANT SELECT,INSERT ON newbert.artifact_dependencies TO newbert_worker;
CREATE POLICY worker_access ON newbert.artifact_dependencies TO newbert_worker USING(true) WITH CHECK(true);
-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration';END $$;

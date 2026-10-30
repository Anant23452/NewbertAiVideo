-- Up Migration
-- This baseline grants tenant SELECT only. Feature migrations add narrow writes.
-- No password or API credentials belong in migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='newbert_runtime') THEN
    CREATE ROLE newbert_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='newbert_runtime' AND
    (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolcanlogin)) THEN
    RAISE EXCEPTION 'Existing newbert_runtime role has unsafe attributes';
  END IF;
END $$;
GRANT USAGE ON SCHEMA newbert TO newbert_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA newbert TO newbert_runtime;
REVOKE SELECT ON newbert.app_users, newbert.platform_budgets, newbert.platform_reservations FROM newbert_runtime;
REVOKE ALL ON newbert.oauth_states, newbert.outbox_events FROM newbert_runtime;
-- Identity bootstrap, OAuth/dispatcher access and writes require narrow later grants.
-- Runtime still has tenant RLS and cannot create schemas, tables or roles.

-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only migration. Use a reviewed forward fix.'; END $$;

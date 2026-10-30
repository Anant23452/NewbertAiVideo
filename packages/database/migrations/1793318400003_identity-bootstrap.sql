-- Up Migration
-- Auth tables are private to the trusted identity service, not tenant API SQL.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='newbert_identity') THEN
    CREATE ROLE newbert_identity NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='newbert_identity' AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolcanlogin)) THEN
    RAISE EXCEPTION 'Unsafe existing identity role';
  END IF;
END $$;
GRANT USAGE ON SCHEMA auth, newbert TO newbert_identity;
GRANT SELECT, INSERT, UPDATE ON auth."user" TO newbert_identity;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.session, auth.account, auth.verification, auth."rateLimit" TO newbert_identity;

CREATE TABLE auth.workspace_binding (
  auth_user_id text PRIMARY KEY REFERENCES auth."user"(id),
  app_user_id uuid NOT NULL UNIQUE REFERENCES newbert.app_users(id),
  workspace_id uuid NOT NULL UNIQUE REFERENCES newbert.workspaces(id)
);
-- No direct binding write or read grant. Resolve only a server-validated subject.
CREATE FUNCTION auth.bootstrap_personal_workspace() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE app_id uuid := gen_random_uuid(); workspace_id uuid := gen_random_uuid(); old_context text;
BEGIN
  old_context := current_setting('app.workspace_id',true);
  PERFORM set_config('app.workspace_id',workspace_id::text,true);
  INSERT INTO newbert.app_users(id,auth_issuer,auth_subject) VALUES(app_id,'newbert:better-auth',NEW.id);
  INSERT INTO newbert.workspaces(id,user_id) VALUES(workspace_id,app_id);
  INSERT INTO newbert.workspace_dispatch(workspace_id) VALUES(workspace_id);
  INSERT INTO auth.workspace_binding(auth_user_id,app_user_id,workspace_id) VALUES(NEW.id,app_id,workspace_id);
  PERFORM set_config('app.workspace_id',coalesce(old_context,''),true);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION auth.bootstrap_personal_workspace() FROM PUBLIC;
CREATE TRIGGER bootstrap_personal_workspace AFTER INSERT ON auth."user"
  FOR EACH ROW EXECUTE FUNCTION auth.bootstrap_personal_workspace();

CREATE FUNCTION newbert.resolve_identity(subject text)
RETURNS TABLE(user_id uuid,workspace_id uuid,status text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT b.app_user_id,b.workspace_id,u.status FROM auth.workspace_binding b
  JOIN newbert.app_users u ON u.id=b.app_user_id
  WHERE b.auth_user_id=subject AND u.auth_issuer='newbert:better-auth' AND u.auth_subject=subject
$$;
REVOKE ALL ON FUNCTION newbert.resolve_identity(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION newbert.resolve_identity(text) TO newbert_identity;
CREATE FUNCTION auth.require_active_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM newbert.resolve_identity(NEW."userId") i WHERE i.status='active') THEN
    RAISE EXCEPTION 'Session unavailable' USING ERRCODE='28000';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION auth.require_active_identity() FROM PUBLIC;
CREATE TRIGGER require_active_identity BEFORE INSERT ON auth.session
  FOR EACH ROW EXECUTE FUNCTION auth.require_active_identity();
GRANT UPDATE(timezone,revision) ON newbert.workspaces TO newbert_runtime;
CREATE INDEX auth_session_expiration ON auth.session("expiresAt");
CREATE INDEX auth_verification_expiration ON auth.verification("expiresAt");

-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only identity migration; use a reviewed forward fix.'; END $$;

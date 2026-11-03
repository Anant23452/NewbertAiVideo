-- Up Migration
-- Move only Newbert-owned identity tables; never rename Supabase's managed schema.
DO $$ BEGIN
  IF to_regnamespace('newbert_auth') IS NOT NULL THEN
    RAISE EXCEPTION 'Target identity schema already exists; review before migration';
  END IF;
  IF to_regclass('auth.workspace_binding') IS NULL OR to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION 'Expected dedicated local Newbert identity schema; managed auth is not eligible';
  END IF;
  ALTER SCHEMA auth RENAME TO newbert_auth;
END $$;

-- Function bodies contain textual qualified names; refresh them after the rename.
CREATE OR REPLACE FUNCTION newbert_auth.bootstrap_personal_workspace() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE app_id uuid := gen_random_uuid(); workspace_id uuid := gen_random_uuid(); old_context text;
BEGIN
  old_context := current_setting('app.workspace_id',true);
  PERFORM set_config('app.workspace_id',workspace_id::text,true);
  INSERT INTO newbert.app_users(id,auth_issuer,auth_subject) VALUES(app_id,'newbert:better-auth',NEW.id);
  INSERT INTO newbert.workspaces(id,user_id) VALUES(workspace_id,app_id);
  INSERT INTO newbert.workspace_dispatch(workspace_id) VALUES(workspace_id);
  INSERT INTO newbert_auth.workspace_binding(auth_user_id,app_user_id,workspace_id) VALUES(NEW.id,app_id,workspace_id);
  PERFORM set_config('app.workspace_id',coalesce(old_context,''),true);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION newbert.resolve_identity(subject text)
RETURNS TABLE(user_id uuid,workspace_id uuid,status text)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT b.app_user_id,b.workspace_id,u.status FROM newbert_auth.workspace_binding b
  JOIN newbert.app_users u ON u.id=b.app_user_id
  WHERE b.auth_user_id=subject AND u.auth_issuer='newbert:better-auth' AND u.auth_subject=subject
$$;

CREATE OR REPLACE FUNCTION newbert_auth.require_active_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM newbert.resolve_identity(NEW."userId") i WHERE i.status='active') THEN
    RAISE EXCEPTION 'Session unavailable' USING ERRCODE='28000';
  END IF;
  RETURN NEW;
END $$;

-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward-only identity namespace migration; restore only using a reviewed plan.'; END $$;

-- Up Migration
ALTER TABLE newbert.workspaces ADD COLUMN instagram_revision bigint NOT NULL DEFAULT 1;
GRANT UPDATE(instagram_revision) ON newbert.workspaces TO newbert_runtime;
CREATE TABLE newbert.instagram_secrets (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES newbert.workspaces(id),
 connection_id uuid NOT NULL, envelope jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,connection_id) REFERENCES newbert.instagram_connections(workspace_id,id)
);
ALTER TABLE newbert.instagram_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE newbert.instagram_secrets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON newbert.instagram_secrets USING(workspace_id=newbert.current_workspace_id()) WITH CHECK(workspace_id=newbert.current_workspace_id());
GRANT SELECT,INSERT,DELETE ON newbert.instagram_secrets TO newbert_runtime;
GRANT SELECT,INSERT ON newbert.oauth_states TO newbert_runtime;
GRANT UPDATE(consumed_at) ON newbert.oauth_states TO newbert_runtime;
ALTER TABLE newbert.oauth_states ADD COLUMN context jsonb NOT NULL DEFAULT '{}'::jsonb;
GRANT INSERT ON newbert.instagram_connections TO newbert_runtime;
GRANT UPDATE(status,secret_ref,granted_scopes,expires_at,revision,disconnected_at) ON newbert.instagram_connections TO newbert_runtime;
ALTER TABLE newbert.instagram_connections ADD COLUMN refreshed_at timestamptz;
GRANT UPDATE(refreshed_at) ON newbert.instagram_connections TO newbert_runtime;
CREATE FUNCTION newbert.pause_instagram_deliveries(connection uuid,reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF reason NOT IN ('connection_changed','connection_disconnected','connection_expired','connection_reauth_required') OR NOT EXISTS(SELECT 1 FROM newbert.instagram_connections WHERE id=connection AND workspace_id=newbert.current_workspace_id()) THEN RAISE EXCEPTION 'Invalid connection'; END IF;
 UPDATE newbert.publish_intents SET state=CASE WHEN state='publishing' THEN 'reconciliation_required' ELSE 'paused' END,pause_reason=reason,revision=revision+1,updated_at=now() WHERE connection_id=connection AND workspace_id=newbert.current_workspace_id() AND state IN ('awaiting_output','scheduled','queued','publishing','paused');
 UPDATE newbert.publication_schedules s SET state='paused',revision=s.revision+1 FROM newbert.publish_intents p WHERE s.intent_id=p.id AND p.connection_id=connection AND s.workspace_id=newbert.current_workspace_id() AND s.state IN ('scheduled','claimed');
END $$;
REVOKE ALL ON FUNCTION newbert.pause_instagram_deliveries(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION newbert.pause_instagram_deliveries(uuid,text) TO newbert_runtime;
-- Down Migration
DO $$ BEGIN RAISE EXCEPTION 'Forward only; use a reviewed forward fix.'; END $$;

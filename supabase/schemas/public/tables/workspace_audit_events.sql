CREATE TABLE "public"."workspace_audit_events" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  uuid                     NOT NULL,
  "actor_user_id" uuid,
  "action"        text                     NOT NULL,
  "target_type"   text                     NOT NULL,
  "target_id"     text                     NOT NULL,
  "target_name"   text,
  "metadata"      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "request_id"    text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_audit_events_action_length" CHECK (((char_length(action) >= 1) AND (char_length(action) <= 100))),
  CONSTRAINT "workspace_audit_events_metadata_object" CHECK ((jsonb_typeof(metadata) = 'object'::text)),
  CONSTRAINT "workspace_audit_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_audit_events_target_id_length" CHECK (((char_length(target_id) >= 1) AND (char_length(target_id) <= 200))),
  CONSTRAINT "workspace_audit_events_target_name_length" CHECK (((target_name IS NULL) OR (char_length(target_name) <= 200))),
  CONSTRAINT "workspace_audit_events_target_type_length" CHECK (((char_length(target_type) >= 1) AND (char_length(target_type) <= 60)))
);

ALTER TABLE "public"."workspace_audit_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_audit_events_workspace_action_created_idx ON public.workspace_audit_events USING btree (workspace_id, action, created_at DESC);

CREATE INDEX workspace_audit_events_workspace_created_idx ON public.workspace_audit_events USING btree (workspace_id, created_at DESC, id DESC);

CREATE INDEX workspace_audit_events_workspace_target_created_idx ON public.workspace_audit_events USING btree (workspace_id, target_type, target_id, created_at DESC);

CREATE TRIGGER workspace_audit_events_append_only
  BEFORE DELETE OR UPDATE ON public.workspace_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_workspace_audit_event_mutation();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_audit_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_audit_events" IS 'Append-only, sanitized workspace control-plane history. Secrets, credential hashes, full scopes, authorization headers, and request bodies must never be stored here.';

REVOKE ALL ON TABLE "public"."workspace_audit_events" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."workspace_audit_events" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_audit_events" FROM "anon", "authenticated";

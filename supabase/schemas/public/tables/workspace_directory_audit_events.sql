CREATE TABLE "public"."workspace_directory_audit_events" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  uuid                     NOT NULL,
  "actor_user_id" uuid,
  "action"        text                     NOT NULL,
  "target_type"   text                     NOT NULL,
  "target_id"     text                     NOT NULL,
  "outcome"       text                     NOT NULL DEFAULT 'success'::text,
  "before_state"  jsonb,
  "after_state"   jsonb,
  "reason"        text,
  "request_id"    text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_directory_audit_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_directory_audit_events_after_state_check" CHECK ((jsonb_typeof(COALESCE(after_state, '{}'::jsonb)) = 'object'::text)),
  CONSTRAINT "workspace_directory_audit_events_before_state_check" CHECK ((jsonb_typeof(COALESCE(before_state, '{}'::jsonb)) = 'object'::text)),
  CONSTRAINT "workspace_directory_audit_events_outcome_check" CHECK ((outcome = ANY (ARRAY['success'::text, 'failure'::text, 'denied'::text]))),
  CONSTRAINT "workspace_directory_audit_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_directory_audit_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_directory_audit_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_directory_audit_events_actor_user_id_idx ON public.workspace_directory_audit_events USING btree (actor_user_id);

CREATE INDEX workspace_directory_audit_events_workspace_created_idx ON public.workspace_directory_audit_events USING btree (workspace_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_directory_audit_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_directory_audit_events" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."workspace_directory_audit_events" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_directory_audit_events" FROM "anon", "authenticated";

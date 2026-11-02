CREATE TABLE "public"."work_error_groups" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "project_id"     uuid                     NOT NULL,
  "fingerprint"    text                     NOT NULL,
  "exception_type" text                     NOT NULL,
  "message"        text                     NOT NULL DEFAULT ''::text,
  "culprit"        text,
  "status"         text                     NOT NULL DEFAULT 'open'::text,
  "event_count"    bigint                   NOT NULL DEFAULT 0,
  "first_seen_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_release"   text,
  "last_environment" text,
  "last_event"     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "work_item_id"   uuid,
  "resolved_at"    timestamp with time zone,
  CONSTRAINT "work_error_groups_last_event_object_check" CHECK ((jsonb_typeof(last_event) = 'object'::text)),
  CONSTRAINT "work_error_groups_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_error_groups_project_fingerprint_key" UNIQUE (project_id, fingerprint),
  CONSTRAINT "work_error_groups_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_error_projects(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_groups_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'ignored'::text]))),
  CONSTRAINT "work_error_groups_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE SET NULL,
  CONSTRAINT "work_error_groups_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_error_groups"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_error_groups_work_item_id_idx ON public.work_error_groups USING btree (work_item_id)
  WHERE (work_item_id IS NOT NULL);

CREATE INDEX work_error_groups_workspace_status_seen_idx ON public.work_error_groups USING btree (workspace_id, status, last_seen_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_groups"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_groups" IS 'Errors grouped by fingerprint (exception type plus top in-app frames, after source maps). One small row per group with counts and the latest sample event; raw events are not stored here. Written by public.record_work_error_event.';

REVOKE ALL ON TABLE "public"."work_error_groups" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_error_groups" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_groups" FROM "anon", "authenticated";

CREATE TABLE "public"."work_item_events" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "work_item_id"   uuid                     NOT NULL,
  "kind"           text                     NOT NULL,
  "author_kind"    text                     NOT NULL DEFAULT 'user'::text,
  "author_user_id" uuid,
  "author_name"    text,
  "body"           text                     NOT NULL DEFAULT ''::text,
  "data"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_item_events_author_kind_check" CHECK ((author_kind = ANY (ARRAY['user'::text, 'agent'::text, 'system'::text, 'github'::text, 'customer'::text]))),
  CONSTRAINT "work_item_events_author_user_id_fkey" FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_item_events_body_length_check" CHECK ((char_length(body) <= 100000)),
  CONSTRAINT "work_item_events_data_object_check" CHECK ((jsonb_typeof(data) = 'object'::text)),
  CONSTRAINT "work_item_events_kind_check" CHECK ((kind = ANY (ARRAY['created'::text, 'comment'::text, 'state'::text, 'priority'::text, 'assignee'::text, 'link'::text, 'triage'::text, 'agent_run'::text, 'customer_request'::text, 'github'::text, 'error'::text, 'project'::text, 'cycle'::text, 'parent'::text, 'relation'::text, 'estimate'::text, 'reply'::text, 'sla'::text, 'stalled'::text, 'attachment'::text, 'milestone'::text]))),
  CONSTRAINT "work_item_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_item_events_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_item_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_item_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_item_events_author_user_id_idx ON public.work_item_events USING btree (author_user_id)
  WHERE (author_user_id IS NOT NULL);

CREATE INDEX work_item_events_workspace_id_idx ON public.work_item_events USING btree (workspace_id);

CREATE INDEX work_item_events_item_created_idx ON public.work_item_events USING btree (work_item_id, created_at);

CREATE POLICY "deny_direct_client_access" ON "public"."work_item_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_item_events" IS 'The timeline of a work item: comments, state and priority changes, links, triage results, agent runs, customer requests and GitHub activity. Append-only in practice.';

REVOKE ALL ON TABLE "public"."work_item_events" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."work_item_events" TO "service_role";

REVOKE ALL ON TABLE "public"."work_item_events" FROM "anon", "authenticated";

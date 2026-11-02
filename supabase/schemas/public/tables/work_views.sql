CREATE TABLE "public"."work_views" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  uuid                     NOT NULL,
  "owner_user_id" uuid,
  "name"          text                     NOT NULL,
  "filters"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "layout"        text                     NOT NULL DEFAULT 'list'::text,
  "position"      integer                  NOT NULL DEFAULT 0,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_views_filters_object_check" CHECK ((jsonb_typeof(filters) = 'object'::text)),
  CONSTRAINT "work_views_layout_check" CHECK ((layout = ANY (ARRAY['list'::text, 'board'::text]))),
  CONSTRAINT "work_views_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
  CONSTRAINT "work_views_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_views_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_views_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_views"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_views_owner_user_id_idx ON public.work_views USING btree (owner_user_id)
  WHERE (owner_user_id IS NOT NULL);

CREATE INDEX work_views_workspace_position_idx ON public.work_views USING btree (workspace_id, position);

CREATE POLICY "deny_direct_client_access" ON "public"."work_views"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_views" IS 'Saved views of work items: filters (state, source, assignee, label, project, cycle, priority, text) and a list or board layout. owner_user_id null means shared with the workspace.';

REVOKE ALL ON TABLE "public"."work_views" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_views" TO "service_role";

REVOKE ALL ON TABLE "public"."work_views" FROM "anon", "authenticated";

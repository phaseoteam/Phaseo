CREATE TABLE "public"."work_recurrences" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "template_id"  uuid                     NOT NULL,
  "cadence"      text                     NOT NULL,
  "next_run_at"  timestamp with time zone NOT NULL,
  "enabled"      boolean                  NOT NULL DEFAULT true,
  "last_item_id" uuid,
  "last_run_at"  timestamp with time zone,
  "created_by"   uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_recurrences_cadence_check" CHECK ((cadence = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
  CONSTRAINT "work_recurrences_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_recurrences_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_recurrences_last_item_id_fkey" FOREIGN KEY (last_item_id) REFERENCES public.work_items(id) ON DELETE SET NULL,
  CONSTRAINT "work_recurrences_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.work_templates(id) ON DELETE CASCADE,
  CONSTRAINT "work_recurrences_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_recurrences"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_recurrences_due_idx ON public.work_recurrences USING btree (next_run_at)
  WHERE enabled;

CREATE POLICY "deny_direct_client_access" ON "public"."work_recurrences"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_recurrences" IS 'Recurring work items: a template made into a new item every day, week or month from next_run_at. Run by web-api''s cron.';

REVOKE ALL ON TABLE "public"."work_recurrences" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_recurrences" TO "service_role";

REVOKE ALL ON TABLE "public"."work_recurrences" FROM "anon", "authenticated";

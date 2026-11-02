CREATE TABLE "public"."work_settings" (
  "workspace_id"           uuid                     NOT NULL,
  "sla_hours"              jsonb                    NOT NULL DEFAULT '{"1": 4, "2": 24, "3": 72, "4": 168}'::jsonb,
  "stall_days"             integer                  NOT NULL DEFAULT 7,
  "ambient_enabled"        boolean                  NOT NULL DEFAULT false,
  "support_drafts_enabled" boolean                  NOT NULL DEFAULT true,
  "updated_by"             uuid,
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_settings_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "work_settings_sla_hours_object_check" CHECK ((jsonb_typeof(sla_hours) = 'object'::text)),
  CONSTRAINT "work_settings_stall_days_check" CHECK (((stall_days >= 1) AND (stall_days <= 90))),
  CONSTRAINT "work_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_settings_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_settings_updated_by_idx ON public.work_settings USING btree (updated_by)
  WHERE (updated_by IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."work_settings"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_settings" IS 'Work tracker settings per workspace: SLA hours by priority (keys "1" to "4"), the days without activity after which an open item counts as stalled, whether the ambient agent follows up on stalled items (off by default), and whether the support agent drafts replies to customers when their item is done. A missing row means the defaults.';

REVOKE ALL ON TABLE "public"."work_settings" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."work_settings" TO "service_role";

REVOKE ALL ON TABLE "public"."work_settings" FROM "anon", "authenticated";

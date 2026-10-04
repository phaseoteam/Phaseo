CREATE TABLE "public"."workspace_byok_monthly_usage" (
  "workspace_id"  uuid                     NOT NULL,
  "month_start"   timestamp with time zone NOT NULL,
  "request_count" bigint                   NOT NULL DEFAULT 0,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_byok_monthly_usage_pkey" PRIMARY KEY (workspace_id, month_start),
  CONSTRAINT "workspace_byok_monthly_usage_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_byok_monthly_usage"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_byok_monthly_usage_month_start_idx ON public.workspace_byok_monthly_usage USING btree (month_start);

CREATE POLICY "service_role_full_access" ON "public"."workspace_byok_monthly_usage"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_byok_monthly_usage" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_byok_monthly_usage" FROM "anon", "authenticated";

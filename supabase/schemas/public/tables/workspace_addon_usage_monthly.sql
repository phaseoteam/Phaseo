CREATE TABLE "public"."workspace_addon_usage_monthly" (
  "workspace_id"          uuid                     NOT NULL,
  "addon_key"             text                     NOT NULL,
  "metric_key"            text                     NOT NULL,
  "period_start"          date                     NOT NULL,
  "quantity"              bigint                   NOT NULL DEFAULT 0,
  "stripe_meter_event_id" text,
  "reported_at"           timestamp with time zone,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "reported_quantity"     bigint                   NOT NULL DEFAULT 0,
  CONSTRAINT "workspace_addon_usage_monthly_addon_key_check" CHECK ((addon_key ~ '^[a-z][a-z0-9_]{1,63}$'::text)),
  CONSTRAINT "workspace_addon_usage_monthly_metric_key_check" CHECK ((metric_key ~ '^[a-z][a-z0-9_]{1,63}$'::text)),
  CONSTRAINT "workspace_addon_usage_monthly_pkey" PRIMARY KEY (workspace_id, addon_key, metric_key, period_start),
  CONSTRAINT "workspace_addon_usage_monthly_quantity_check" CHECK ((quantity >= 0)),
  CONSTRAINT "workspace_addon_usage_reported_quantity_check" CHECK (((reported_quantity >= 0) AND (reported_quantity <= quantity))),
  CONSTRAINT "workspace_addon_usage_monthly_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_addon_usage_monthly"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_addon_usage_unreported_idx ON public.workspace_addon_usage_monthly USING btree (period_start, addon_key)
  WHERE (reported_at IS NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_addon_usage_monthly"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_addon_usage_monthly" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_addon_usage_monthly" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_addon_usage_monthly" FROM "anon", "authenticated";

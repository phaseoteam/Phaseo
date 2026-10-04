CREATE TABLE "public"."public_model_workspace_usage_weekly" (
  "week_start"     date                     NOT NULL,
  "model_id"       text                     NOT NULL,
  "workspace_hash" text                     NOT NULL,
  "requests"       bigint                   NOT NULL DEFAULT 0,
  "refreshed_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "public_model_workspace_usage_weekly_pkey" PRIMARY KEY (week_start, model_id, workspace_hash)
);

ALTER TABLE "public"."public_model_workspace_usage_weekly"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX public_model_workspace_usage_weekly_model_week_idx ON public.public_model_workspace_usage_weekly USING btree (model_id, week_start DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."public_model_workspace_usage_weekly"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."public_model_workspace_usage_weekly" IS 'Internal privacy-safe workspace activity used to aggregate public model return rates.';

REVOKE ALL ON TABLE "public"."public_model_workspace_usage_weekly" FROM "service_role";

GRANT SELECT ON TABLE "public"."public_model_workspace_usage_weekly" TO "service_role";

REVOKE ALL ON TABLE "public"."public_model_workspace_usage_weekly" FROM "anon", "authenticated";

CREATE TABLE "public"."public_monitor_weekly_usage" (
  "model_id"         text                     NOT NULL,
  "provider_id"      text                     NOT NULL,
  "total_tokens"     numeric,
  "throughput_sum"   numeric,
  "throughput_count" numeric,
  "latency_sum"      numeric,
  "latency_count"    numeric,
  "refreshed_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "public_monitor_weekly_usage_pkey" PRIMARY KEY (model_id, provider_id)
);

ALTER TABLE "public"."public_monitor_weekly_usage"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."public_monitor_weekly_usage"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."public_monitor_weekly_usage" IS 'Rolling seven-day gateway usage per canonical model and provider, refreshed off the request path for get_monitor_model_rows.';

REVOKE ALL ON TABLE "public"."public_monitor_weekly_usage" FROM "service_role";

GRANT SELECT ON TABLE "public"."public_monitor_weekly_usage" TO "service_role";

REVOKE ALL ON TABLE "public"."public_monitor_weekly_usage" FROM "anon", "authenticated";

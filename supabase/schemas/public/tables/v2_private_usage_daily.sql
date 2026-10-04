CREATE TABLE "public"."v2_private_usage_daily" (
  "rollup_id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "usage_date"                  date                     NOT NULL,
  "workspace_id"                uuid                     NOT NULL,
  "app_id"                      uuid,
  "model_slug"                  text                     NOT NULL,
  "provider_model_id"           text,
  "requests"                    bigint                   NOT NULL DEFAULT 0,
  "successful_requests"         bigint                   NOT NULL DEFAULT 0,
  "failed_requests"             bigint                   NOT NULL DEFAULT 0,
  "rate_limited_requests"       bigint                   NOT NULL DEFAULT 0,
  "tool_call_count"             bigint                   NOT NULL DEFAULT 0,
  "structured_output_attempts"  bigint                   NOT NULL DEFAULT 0,
  "structured_output_successes" bigint                   NOT NULL DEFAULT 0,
  "latency_sum_ms"              bigint                   NOT NULL DEFAULT 0,
  "latency_count"               bigint                   NOT NULL DEFAULT 0,
  "generation_sum_ms"           bigint                   NOT NULL DEFAULT 0,
  "generation_count"            bigint                   NOT NULL DEFAULT 0,
  "throughput_sum"              numeric(30,12)           NOT NULL DEFAULT 0,
  "throughput_count"            bigint                   NOT NULL DEFAULT 0,
  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "cloudflare_colo"             text,
  "tool_call_requests"          bigint                   NOT NULL DEFAULT 0,
  "tool_call_successes"         bigint                   NOT NULL DEFAULT 0,
  "cached_input_tokens"         numeric(30,12)           NOT NULL DEFAULT 0,
  "input_tokens"                numeric(30,12)           NOT NULL DEFAULT 0,
  "gateway_total_sum_ms"        numeric(30,3)            NOT NULL DEFAULT 0,
  "gateway_total_count"         bigint                   NOT NULL DEFAULT 0,
  "internal_dispatch_sum_ms"    numeric(30,3)            NOT NULL DEFAULT 0,
  "internal_dispatch_count"     bigint                   NOT NULL DEFAULT 0,
  "upstream_attempts"           bigint                   NOT NULL DEFAULT 0,
  "failed_upstream_attempts"    bigint                   NOT NULL DEFAULT 0,
  "cost_nanos"                  numeric(30,0)            NOT NULL DEFAULT 0,
  CONSTRAINT "v2_private_usage_daily_app_id_fkey" FOREIGN KEY (app_id) REFERENCES public.api_apps(id) ON DELETE SET NULL,
  CONSTRAINT "v2_private_usage_daily_cloudflare_colo_check" CHECK (((cloudflare_colo IS NULL) OR (cloudflare_colo ~ '^[A-Z0-9]{3}$'::text))),
  CONSTRAINT "v2_private_usage_daily_counts_check"
    CHECK
    (((requests >= 0) AND (successful_requests >= 0) AND (failed_requests >= 0) AND (rate_limited_requests >= 0) AND (tool_call_count >= 0) AND (structured_output_attempts >= 0)
    AND (structured_output_successes >= 0) AND (latency_sum_ms >= 0) AND (latency_count >= 0) AND (generation_sum_ms >= 0) AND (generation_count >= 0) AND
    (throughput_sum >= (0)::numeric) AND (throughput_count >= 0))),
  CONSTRAINT "v2_private_usage_daily_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE RESTRICT,
  CONSTRAINT "v2_private_usage_daily_observability_counts_check"
    CHECK
    (((tool_call_requests >= 0) AND (tool_call_successes >= 0) AND (tool_call_successes <= tool_call_requests) AND (cached_input_tokens >= (0)::numeric) AND (input_tokens >=
    (0)::numeric) AND (gateway_total_sum_ms >= (0)::numeric) AND (gateway_total_count >= 0) AND (internal_dispatch_sum_ms >= (0)::numeric) AND (internal_dispatch_count >= 0) AND
    (upstream_attempts >= 0) AND (failed_upstream_attempts >= 0) AND (failed_upstream_attempts <= upstream_attempts) AND (cost_nanos >= (0)::numeric))),
  CONSTRAINT "v2_private_usage_daily_pkey" PRIMARY KEY (rollup_id),
  CONSTRAINT "v2_private_usage_daily_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE SET NULL,
  CONSTRAINT "v2_private_usage_daily_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_private_usage_daily"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_private_usage_daily_app_date_idx ON public.v2_private_usage_daily USING btree (app_id, usage_date DESC)
  WHERE (app_id IS NOT NULL);

CREATE UNIQUE INDEX v2_private_usage_daily_key ON public.v2_private_usage_daily
  USING btree
  (workspace_id, usage_date, COALESCE(app_id, '00000000-0000-0000-0000-000000000000'::uuid), model_slug, COALESCE(provider_model_id, ''::text), COALESCE(cloudflare_colo, ''::text));

CREATE INDEX v2_private_usage_daily_model_date_idx ON public.v2_private_usage_daily USING btree (model_slug, usage_date DESC);

CREATE INDEX v2_private_usage_daily_provider_model_id_idx ON public.v2_private_usage_daily USING btree (provider_model_id)
  WHERE (provider_model_id IS NOT NULL);

CREATE INDEX v2_private_usage_daily_workspace_date_idx ON public.v2_private_usage_daily USING btree (workspace_id, usage_date DESC);

CREATE POLICY "v2_private_usage_daily_workspace_select" ON "public"."v2_private_usage_daily"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_workspace_member(v2_private_usage_daily.workspace_id) AS is_workspace_member));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_private_usage_daily" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."v2_private_usage_daily" IS 'Workspace-scoped daily usage/performance projection for settings and trends.';

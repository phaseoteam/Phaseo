CREATE TABLE "public"."v2_public_usage_hourly" (
  "rollup_id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "bucket_start"                timestamp with time zone NOT NULL,
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
  CONSTRAINT "v2_public_usage_hourly_app_id_fkey" FOREIGN KEY (app_id) REFERENCES public.api_apps(id) ON DELETE SET NULL,
  CONSTRAINT "v2_public_usage_hourly_cloudflare_colo_check" CHECK (((cloudflare_colo IS NULL) OR (cloudflare_colo ~ '^[A-Z0-9]{3}$'::text))),
  CONSTRAINT "v2_public_usage_hourly_cost_check" CHECK ((cost_nanos >= (0)::numeric)),
  CONSTRAINT "v2_public_usage_hourly_counts_check"
    CHECK
    (((requests >= 0) AND (successful_requests >= 0) AND (failed_requests >= 0) AND (rate_limited_requests >= 0) AND (tool_call_count >= 0) AND (structured_output_attempts >= 0)
    AND (structured_output_successes >= 0) AND (latency_sum_ms >= 0) AND (latency_count >= 0) AND (generation_sum_ms >= 0) AND (generation_count >= 0) AND
    (throughput_sum >= (0)::numeric) AND (throughput_count >= 0))),
  CONSTRAINT "v2_public_usage_hourly_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE RESTRICT,
  CONSTRAINT "v2_public_usage_hourly_observability_counts_check"
    CHECK
    (((tool_call_requests >= 0) AND (tool_call_successes >= 0) AND (tool_call_successes <= tool_call_requests) AND (cached_input_tokens >= (0)::numeric) AND (input_tokens >=
    (0)::numeric) AND (gateway_total_sum_ms >= (0)::numeric) AND (gateway_total_count >= 0) AND (internal_dispatch_sum_ms >= (0)::numeric) AND (internal_dispatch_count >= 0) AND
    (upstream_attempts >= 0) AND (failed_upstream_attempts >= 0) AND (failed_upstream_attempts <= upstream_attempts))),
  CONSTRAINT "v2_public_usage_hourly_pkey" PRIMARY KEY (rollup_id),
  CONSTRAINT "v2_public_usage_hourly_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE SET NULL
);

ALTER TABLE "public"."v2_public_usage_hourly"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_public_usage_hourly_app_id_idx ON public.v2_public_usage_hourly USING btree (app_id)
  WHERE (app_id IS NOT NULL);

CREATE UNIQUE INDEX v2_public_usage_hourly_key ON public.v2_public_usage_hourly
  USING btree (bucket_start, COALESCE(app_id, '00000000-0000-0000-0000-000000000000'::uuid), model_slug, COALESCE(provider_model_id, ''::text), COALESCE(cloudflare_colo, ''::text));

CREATE INDEX v2_public_usage_hourly_model_bucket_idx ON public.v2_public_usage_hourly USING btree (model_slug, bucket_start DESC);

CREATE INDEX v2_public_usage_hourly_model_colo_bucket_idx ON public.v2_public_usage_hourly USING btree (model_slug, cloudflare_colo, bucket_start DESC)
  WHERE (cloudflare_colo IS NOT NULL);

CREATE INDEX v2_public_usage_hourly_provider_bucket_idx ON public.v2_public_usage_hourly USING btree (provider_model_id, bucket_start DESC)
  WHERE (provider_model_id IS NOT NULL);

CREATE POLICY "v2_public_usage_hourly_public_select" ON "public"."v2_public_usage_hourly"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((app_id IS NULL) OR ( SELECT public.is_public_api_app(v2_public_usage_hourly.app_id) AS is_public_api_app)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_public_usage_hourly" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_public_usage_hourly"."cloudflare_colo" IS 'Execution colo dimension for region-filtered public performance analytics.';

COMMENT ON POLICY "v2_public_usage_hourly_public_select" ON "public"."v2_public_usage_hourly" IS 'Exposes anonymous usage and usage attributed to explicitly public apps only.';

COMMENT ON TABLE "public"."v2_public_usage_hourly" IS 'Recent public hourly projection for performance pages; daily remains the durable baseline.';

create policy public_usage_model_visibility on public.v2_public_usage_hourly as restrictive
for select to anon, authenticated using (public.public_reporting_route_is_visible(model_slug, provider_model_id));

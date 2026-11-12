CREATE VIEW "public"."v2_web_private_usage_daily" WITH (security_invoker=true) AS  SELECT (usage.usage_date)::timestamp with time zone AS bucket_15m,
    usage.workspace_id,
    usage.model_slug AS canonical_model_id,
    route.provider_slug AS provider,
    usage.app_id,
    usage.requests,
    usage.successful_requests AS success_requests,
    (usage.cost_nanos)::bigint AS total_cost_nanos,
    usage.latency_sum_ms,
    usage.latency_count AS latency_samples,
    usage.throughput_sum,
    usage.throughput_count AS throughput_samples,
    COALESCE(meters.total_tokens, (0)::numeric) AS total_tokens
   FROM ((public.v2_private_usage_daily usage
     LEFT JOIN public.v2_model_provider_routes route ON ((route.provider_model_id = usage.provider_model_id)))
     LEFT JOIN LATERAL ( SELECT COALESCE(max(meter.quantity) FILTER (WHERE (meter.meter_key = 'total_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = ANY (ARRAY['input_tokens'::text, 'output_tokens'::text, 'input_text_tokens'::text, 'output_text_tokens'::text]))), (0)::numeric) AS total_tokens
           FROM public.v2_private_usage_daily_meters meter
          WHERE (meter.rollup_id = usage.rollup_id)) meters ON (true));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_web_private_usage_daily" TO "anon", "authenticated", "service_role";

COMMENT ON VIEW "public"."v2_web_private_usage_daily" IS 'Workspace daily analytics projection sourced only from V2 rollups.';

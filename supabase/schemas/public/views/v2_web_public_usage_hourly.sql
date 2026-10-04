CREATE VIEW "public"."v2_web_public_usage_hourly" WITH (security_invoker=true) AS  WITH meters AS (
         SELECT meter.rollup_id,
            COALESCE(max(meter.quantity) FILTER (WHERE (meter.meter_key = 'total_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = ANY (ARRAY['input_tokens'::text, 'output_tokens'::text]))), sum(meter.quantity) FILTER (WHERE (meter.meter_key = ANY (ARRAY['input_text_tokens'::text, 'output_text_tokens'::text]))), (0)::numeric) AS total_tokens
           FROM public.v2_public_usage_hourly_meters meter
          GROUP BY meter.rollup_id
        )
 SELECT usage.bucket_start AS bucket_15m,
    usage.model_slug AS canonical_model_id,
    route.provider_slug AS provider,
    usage.app_id,
    usage.requests,
    usage.successful_requests AS success_requests,
    COALESCE(meters.total_tokens, (0)::numeric) AS total_tokens,
    (usage.cost_nanos)::bigint AS total_cost_nanos,
    usage.latency_sum_ms,
    usage.latency_count AS latency_samples,
    usage.throughput_sum,
    usage.throughput_count AS throughput_samples,
    usage.generation_sum_ms,
    usage.generation_count AS generation_samples
   FROM (((public.v2_public_usage_hourly usage
     JOIN public.v2_model_provider_routes route ON (((route.provider_model_id = usage.provider_model_id) AND (COALESCE(route.is_stealth, false) = false) AND (route.routing_enabled = true) AND (route.status = ANY (ARRAY['active'::text, 'degraded'::text])) AND ((route.effective_from IS NULL) OR (route.effective_from <= now())) AND ((route.effective_to IS NULL) OR (route.effective_to > now())))))
     JOIN public.v2_models model ON (((model.model_slug = usage.model_slug) AND (model.hidden = false) AND (model.status <> 'disabled'::text))))
     LEFT JOIN meters ON ((meters.rollup_id = usage.rollup_id)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_web_public_usage_hourly" TO "anon", "authenticated", "service_role";

COMMENT ON VIEW "public"."v2_web_public_usage_hourly" IS 'Public hourly analytics projection sourced only from V2 rollups and meters.';

CREATE VIEW "private"."v2_usage_overview_requests" WITH (security_invoker=true) AS  SELECT fact.request_event_id,
    fact.workspace_id,
    fact.occurred_at,
    COALESCE(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input) AS model_id,
    fact.provider_model_id,
    fact.key_id,
    fact.app_id,
    COALESCE(fact.byok, false) AS byok,
    (fact.success IS TRUE) AS successful,
    COALESCE((fact.error_code ~~ '%:guardrail_blocked'::text), false) AS guardrail_blocked,
    COALESCE(fact.cost_nanos, (0)::bigint) AS cost_nanos,
    COALESCE(usage.total_tokens, (usage.input_tokens + usage.output_tokens)) AS tokens,
    usage.input_tokens,
    usage.output_tokens,
    usage.reasoning_tokens,
    usage.cached_tokens,
        CASE
            WHEN (jsonb_typeof((fact.safe_metadata -> 'labels'::text)) = 'array'::text) THEN (fact.safe_metadata -> 'labels'::text)
            ELSE '[]'::jsonb
        END AS labels
   FROM (public.v2_request_facts fact
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'input_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'prompt_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'input_text_tokens'::text)), (0)::numeric) AS input_tokens,
            COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'output_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'completion_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'output_text_tokens'::text)), (0)::numeric) AS output_tokens,
            sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'total_tokens'::text)) AS total_tokens,
            COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'reasoning_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'output_reasoning_tokens'::text)), (0)::numeric) AS reasoning_tokens,
            (COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_input_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_read_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cache_read_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_read_text_tokens'::text)), (0)::numeric) + COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cache_write_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_write_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_write_text_tokens'::text)), (0)::numeric)) AS cached_tokens
           FROM public.v2_request_usage meter
          WHERE (meter.request_event_id = fact.request_event_id)) usage ON (true))
  WHERE (COALESCE(fact.endpoint, ''::text) <> ALL (ARRAY['video.generation'::text, 'batch'::text, 'music.generate'::text]));

GRANT SELECT ON TABLE "private"."v2_usage_overview_requests" TO "service_role";

COMMENT ON VIEW "private"."v2_usage_overview_requests" IS 'One row per request as the usage overview counts it: the resolved model, tokens as the reported total or input plus output, cached reads and writes (one alias each, since the gateway writes the same count under several), guardrail blocks and request labels. Async job endpoints are left out; their own pages count them. Feeds the 15-minute rollups and the requests at the edges of get_private_usage_overview.';

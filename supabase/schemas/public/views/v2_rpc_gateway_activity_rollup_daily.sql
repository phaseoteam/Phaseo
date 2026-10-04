CREATE VIEW "public"."v2_rpc_gateway_activity_rollup_daily" WITH (security_invoker=true) AS  SELECT usage.usage_date AS day_bucket,
    usage.workspace_id AS team_id,
    usage.model_slug AS model_id,
    'unknown'::text AS endpoint,
    route.provider_slug AS provider,
    (0)::bigint AS usage_nanos,
    (0)::bigint AS byok_usage_nanos,
    usage.requests,
    (0)::bigint AS prompt_tokens,
    (0)::bigint AS completion_tokens,
    (0)::bigint AS reasoning_tokens,
    usage.updated_at
   FROM (public.v2_private_usage_daily usage
     LEFT JOIN public.v2_model_provider_routes route ON ((route.provider_model_id = usage.provider_model_id)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_rpc_gateway_activity_rollup_daily" TO "anon", "authenticated", "service_role";

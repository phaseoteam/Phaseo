CREATE VIEW "public"."v2_rpc_gateway_usage_rollup_daily_app" WITH (security_invoker=true) AS  SELECT (day_bucket)::timestamp with time zone AS day_bucket,
    app_id,
    (sum(requests))::bigint AS requests,
    (sum(success_requests))::bigint AS success_requests,
    (sum(total_tokens))::bigint AS total_tokens,
    (sum(total_cost_nanos))::bigint AS total_cost_nanos,
    (count(DISTINCT canonical_model_id))::integer AS unique_models
   FROM public.v2_web_public_usage_daily usage
  WHERE (app_id IS NOT NULL)
  GROUP BY day_bucket, app_id;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_rpc_gateway_usage_rollup_daily_app" TO "anon", "authenticated", "service_role";

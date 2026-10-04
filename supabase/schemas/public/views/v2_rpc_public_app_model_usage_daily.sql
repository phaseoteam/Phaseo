CREATE VIEW "public"."v2_rpc_public_app_model_usage_daily" WITH (security_invoker=true) AS  SELECT usage.day_bucket,
    (usage.app_id)::text AS app_id,
    usage.canonical_model_id AS model_id,
    usage.requests,
    (usage.total_tokens)::bigint AS tokens,
    now() AS refreshed_at
   FROM (public.v2_web_public_usage_daily usage
     JOIN public.api_apps app ON (((app.id = usage.app_id) AND (app.is_public = true))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_rpc_public_app_model_usage_daily" TO "anon", "authenticated", "service_role";

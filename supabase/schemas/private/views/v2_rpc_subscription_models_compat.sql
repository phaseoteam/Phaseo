CREATE VIEW "private"."v2_rpc_subscription_models_compat" WITH (security_invoker=true) AS  SELECT plan_uuid,
    model_slug,
    model_info,
    rate_limit,
    other_info,
    model_slug AS model_id
   FROM public.v2_subscription_plan_models relation;

GRANT SELECT ON TABLE "private"."v2_rpc_subscription_models_compat" TO "service_role";

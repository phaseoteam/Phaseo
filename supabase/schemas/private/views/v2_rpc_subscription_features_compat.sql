CREATE VIEW "private"."v2_rpc_subscription_features_compat" WITH (security_invoker=true) AS  SELECT plan_uuid,
    feature_name,
    feature_value,
    feature_description,
    other_info
   FROM public.v2_subscription_plan_features feature;

GRANT SELECT ON TABLE "private"."v2_rpc_subscription_features_compat" TO "service_role";

CREATE VIEW "private"."v2_rpc_subscription_plans_compat" WITH (security_invoker=true) AS  SELECT plan_uuid,
    plan_id,
    name,
    lab_slug,
    description,
    frequency,
    price,
    currency,
    link,
    other_info,
    created_at,
    updated_at,
    lab_slug AS organisation_id
   FROM public.v2_subscription_plans plan;

GRANT SELECT ON TABLE "private"."v2_rpc_subscription_plans_compat" TO "service_role";

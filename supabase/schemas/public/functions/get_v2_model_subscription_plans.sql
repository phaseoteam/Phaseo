CREATE OR REPLACE FUNCTION public.get_v2_model_subscription_plans (
  p_model_slug text
)
  RETURNS TABLE (
    plan_uuid        uuid,
    plan_id          text,
    name             text,
    lab_slug         text,
    description      text,
    link             text,
    other_info       jsonb,
    created_at       timestamp with time zone,
    updated_at       timestamp with time zone,
    model_info       jsonb,
    rate_limit       jsonb,
    model_other_info jsonb,
    price            numeric,
    currency         text,
    frequency        text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select plan.plan_uuid, plan.plan_id, plan.name, plan.lab_slug, plan.description, plan.link,
    plan.other_info, plan.created_at, plan.updated_at, relation.model_info,
    relation.rate_limit, relation.other_info, plan.price, plan.currency, plan.frequency
  from public.v2_subscription_plan_models relation
  join public.v2_subscription_plans plan on plan.plan_uuid = relation.plan_uuid
  where relation.model_slug = lower(trim(p_model_slug))
    and (relation.effective_to is null or relation.effective_to > now())
    and (plan.effective_to is null or plan.effective_to > now())
  order by plan.plan_id, plan.frequency;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_subscription_plans"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_subscription_plans"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_subscription_plans"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_subscription_plans"(text) TO "postgres";

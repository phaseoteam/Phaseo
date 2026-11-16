CREATE OR REPLACE FUNCTION public.get_v2_subscription_model_usage (
  p_model_slug text DEFAULT NULL,
  p_plan_id text DEFAULT NULL
)
  RETURNS TABLE (
    model_slug                  text,
    model_name                  text,
    plan_uuid                   uuid,
    plan_id                     text,
    plan_name                   text,
    lab_slug                    text,
    scenario                    text,
    monthly_price_usd           numeric,
    monthly_tokens              numeric,
    effective_usd_per_mtok      numeric,
    api_equivalent_usd_per_mtok numeric,
    share_of_api_price          numeric,
    workload                    text,
    basis                       text,
    confidence                  text,
    source_name                 text,
    source_url                  text,
    measured_on                 text,
    promo_until                 date
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  -- The plan's current monthly USD price for one account or seat: the cheapest live monthly offer whose
  -- standard-phase components are all fixed amounts or free. The source's own price is the fallback.
  with monthly_offer as (
    select o.plan_uuid, min(components.total) as price_usd
    from public.v2_subscription_plan_offers o
    cross join lateral (
      select sum(case when c.pricing_type = 'free' then 0 else c.amount end) as total, count(*) as parts,
        bool_and(c.pricing_type = 'free' or (c.pricing_type = 'fixed' and c.amount is not null)) as all_fixed
      from public.v2_subscription_offer_prices c
      where c.offer_uuid = o.offer_uuid and c.phase = 'standard'
        and c.effective_from <= now() and (c.effective_to is null or c.effective_to > now())
    ) components
    where o.billing_interval = 'month' and o.billing_interval_count = 1 and o.currency = 'USD' and o.region_code is null
      and o.effective_from <= now() and (o.effective_to is null or o.effective_to > now())
      and components.parts > 0 and components.all_fixed
    group by o.plan_uuid
  ),
  usage as (
    select u.*, model.name as model_name, plan.plan_id, plan.name as plan_name, plan.lab_slug,
      coalesce(monthly_offer.price_usd, u.plan_price_usd) as monthly_price_usd
    from public.v2_subscription_plan_model_usage u
    join public.v2_subscription_plans plan on plan.plan_uuid = u.plan_uuid
    join public.v2_models model on model.model_slug = u.model_slug
    left join monthly_offer on monthly_offer.plan_uuid = u.plan_uuid
    where u.effective_to is null
      and (p_model_slug is null or u.model_slug = lower(trim(p_model_slug)))
      and (p_plan_id is null or plan.plan_id = p_plan_id)
  )
  select usage.model_slug, usage.model_name, usage.plan_uuid, usage.plan_id, usage.plan_name, usage.lab_slug, usage.scenario,
    usage.monthly_price_usd, usage.monthly_tokens,
    round(usage.monthly_price_usd / (usage.monthly_tokens / 1000000), 6),
    usage.api_equivalent_usd_per_mtok,
    round(usage.monthly_price_usd / (usage.monthly_tokens / 1000000) / usage.api_equivalent_usd_per_mtok, 6),
    usage.workload, usage.basis, usage.confidence, usage.source_name, usage.source_url, usage.measured_on, usage.promo_until
  from usage
  order by usage.model_slug, usage.monthly_price_usd nulls last, usage.plan_id, usage.scenario
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_subscription_model_usage"(text, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_subscription_model_usage"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_subscription_model_usage"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_subscription_model_usage"(text, text) TO "postgres";

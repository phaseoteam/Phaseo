CREATE OR REPLACE FUNCTION public.get_v2_subscription_monthly_prices (
  p_lab_slug text DEFAULT NULL
)
  RETURNS TABLE (
    plan_uuid         uuid,
    monthly_price_usd numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  -- Each active plan's current monthly USD price for one account or seat: the cheapest live monthly offer
  -- whose ongoing components are all fixed amounts or free. Ongoing = not introductory, no end cycle, and
  -- starting at the offer's latest such cycle (so a renewal price replaces the first-cycle price).
  select o.plan_uuid, min(components.total)
  from public.v2_subscription_plan_offers o
  join public.v2_subscription_plans plan on plan.plan_uuid = o.plan_uuid
  cross join lateral (
    select sum(case when c.pricing_type = 'free' then 0 else c.amount end) as total, count(*) as parts,
      bool_and(c.pricing_type = 'free' or (c.pricing_type = 'fixed' and c.amount is not null)) as all_fixed
    from (
      select c.*, max(coalesce(c.starts_at_cycle, 1)) over () as last_start
      from public.v2_subscription_offer_prices c
      where c.offer_uuid = o.offer_uuid and c.phase <> 'introductory' and c.duration_cycles is null
        and c.effective_from <= now() and (c.effective_to is null or c.effective_to > now())
    ) c
    where coalesce(c.starts_at_cycle, 1) = c.last_start
  ) components
  where o.billing_interval = 'month' and o.billing_interval_count = 1 and o.currency = 'USD' and o.region_code is null
    and o.effective_from <= now() and (o.effective_to is null or o.effective_to > now())
    and plan.status = 'active' and (p_lab_slug is null or plan.lab_slug = p_lab_slug)
    and components.parts > 0 and components.all_fixed
  group by o.plan_uuid
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_subscription_monthly_prices"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_subscription_monthly_prices"(text) TO "service_role";

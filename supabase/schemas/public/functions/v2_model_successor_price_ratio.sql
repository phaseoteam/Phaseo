CREATE OR REPLACE FUNCTION public.v2_model_successor_price_ratio (
  p_from_model_slug text,
  p_to_model_slug   text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  -- Compares standard-tier unit prices on the meters both models bill and
  -- returns the largest ratio. The old model uses its last known prices because
  -- its routes no longer serve; the successor only counts routes that route.
  -- The ratio is null when the models share no meter the old model charged for.
  with prices as (
    select r.model_slug, mt.meter_key, min(mt.price_nanos / nullif(mt.unit_quantity, 0)) as unit_price
    from public.v2_model_provider_routes r
    join lateral (
      select distinct on (s.sku_code) s.sku_id from public.v2_pricing_skus s
      where s.provider_model_id=r.provider_model_id and s.status='active' and s.effective_from<=now()
        and coalesce(s.service_tier_slug,'standard')='standard'
      order by s.sku_code, s.effective_from desc
    ) sku on true
    join public.v2_pricing_sku_meters mt on mt.sku_id=sku.sku_id and mt.billable
    where r.model_slug=p_from_model_slug or (r.model_slug=p_to_model_slug and r.routing_enabled)
    group by r.model_slug, mt.meter_key
  ), pairs as (
    select o.unit_price as old_price, t.unit_price as new_price
    from prices o join prices t on t.meter_key=o.meter_key and t.model_slug=p_to_model_slug
    where o.model_slug=p_from_model_slug
  ), summary as (
    select count(*) > 0 and coalesce(bool_and(old_price > 0 or new_price = 0), false) as comparable,
      max(case when old_price > 0 then new_price / old_price when new_price = 0 then 0 end) as ratio
    from pairs
  )
  select jsonb_build_object('comparable', comparable, 'ratio', case when comparable then round(ratio, 6) end)
  from summary
$function$;

GRANT EXECUTE ON FUNCTION "public"."v2_model_successor_price_ratio"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."v2_model_successor_price_ratio"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."v2_model_successor_price_ratio"(text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."v2_model_successor_price_ratio"(text, text) FROM PUBLIC, "anon", "authenticated";

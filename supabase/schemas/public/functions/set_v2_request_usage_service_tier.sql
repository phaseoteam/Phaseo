CREATE OR REPLACE FUNCTION public.set_v2_request_usage_service_tier()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_provider_model_id text;
  v_occurred_at timestamptz;
  v_service_tier text;
  v_existing_sku_tier text;
  v_sku_meter_id uuid;
begin
  select
    fact.provider_model_id,
    fact.occurred_at,
    fact.service_tier_slug,
    lower(nullif(trim(sku.service_tier_slug), ''))
  into v_provider_model_id, v_occurred_at, v_service_tier, v_existing_sku_tier
  from public.v2_request_facts fact
  left join public.v2_pricing_sku_meters current_meter
    on current_meter.sku_meter_id = new.sku_meter_id
  left join public.v2_pricing_skus sku on sku.sku_id = current_meter.sku_id
  where fact.request_event_id = new.request_event_id;

  if v_provider_model_id is null or v_service_tier is null then
    return new;
  end if;
  if v_existing_sku_tier = 'free' then
    return new;
  end if;

  select sku_meter.sku_meter_id
  into v_sku_meter_id
  from public.v2_pricing_sku_meters sku_meter
  join public.v2_pricing_skus sku on sku.sku_id = sku_meter.sku_id
  where sku.provider_model_id = v_provider_model_id
    and sku_meter.meter_key = lower(trim(new.meter_key))
    and coalesce(public.normalize_v2_service_tier(sku.service_tier_slug), 'standard') = v_service_tier
    and sku.status = 'active'
    and sku.effective_from <= v_occurred_at
    and (sku.effective_to is null or sku.effective_to > v_occurred_at)
  order by sku.version desc, sku.effective_from desc, sku.sku_id
  limit 1;

  if v_sku_meter_id is not null then
    new.sku_meter_id := v_sku_meter_id;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_v2_request_usage_service_tier"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_v2_request_usage_service_tier"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_v2_request_usage_service_tier"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_v2_request_usage_service_tier"() FROM PUBLIC, "anon", "authenticated";

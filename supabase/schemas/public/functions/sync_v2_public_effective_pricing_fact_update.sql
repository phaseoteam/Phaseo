CREATE OR REPLACE FUNCTION public.sync_v2_public_effective_pricing_fact_update()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  source_fact public.v2_request_facts%rowtype;
  old_service_tier text;
  new_service_tier text;
  old_plan text;
  new_plan text;
  source_service_tier text;
  target_model text;
  target_date date;
  target_provider text;
  totals record;
begin
  old_service_tier := coalesce(
    public.normalize_v2_service_tier(old.service_tier_slug),
    public.normalize_v2_service_tier(old.safe_metadata->>'service_tier'),
    public.normalize_v2_service_tier(old.safe_metadata->>'service_tier_observed'),
    public.normalize_v2_service_tier(old.safe_metadata->>'service_tier_requested'),
    case when old.endpoint = 'batch' then 'batch' else null end
  );
  new_service_tier := case
    when new.service_tier_slug is distinct from old.service_tier_slug then coalesce(
      public.normalize_v2_service_tier(new.service_tier_slug),
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier'),
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_observed'),
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_requested'),
      old_service_tier
    )
    else coalesce(
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier'),
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_observed'),
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_requested'),
      public.normalize_v2_service_tier(new.service_tier_slug),
      case when new.endpoint = 'batch' then 'batch' else old_service_tier end
    )
  end;
  old_plan := public.resolve_v2_effective_pricing_plan(old_service_tier, null);
  new_plan := public.resolve_v2_effective_pricing_plan(new_service_tier, null);

  if tg_when = 'BEFORE' then
    new.service_tier_requested := coalesce(
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_requested'),
      public.normalize_v2_service_tier(new.service_tier_requested)
    );
    new.service_tier_observed := coalesce(
      public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_observed'),
      public.normalize_v2_service_tier(new.service_tier_observed)
    );
    new.service_tier_slug := new_service_tier;
  end if;

  if (old.provider_model_id, old.routed_model_slug, old.requested_model_slug, old.occurred_at, old_plan)
    is not distinct from
    (new.provider_model_id, new.routed_model_slug, new.requested_model_slug, new.occurred_at, new_plan)
  then
    return new;
  end if;

  if tg_when = 'BEFORE' then
    source_fact := old;
    source_service_tier := old_service_tier;
  else
    source_fact := new;
    source_service_tier := new_service_tier;
  end if;
  target_model := coalesce(source_fact.routed_model_slug, source_fact.requested_model_slug);
  target_date := source_fact.occurred_at::date;
  select route.provider_slug into target_provider
  from public.v2_model_provider_routes route
  where route.provider_model_id = source_fact.provider_model_id;

  if target_model is null or target_provider is null then return new; end if;

  for totals in
    select
      public.resolve_v2_effective_pricing_plan(source_service_tier, sku.service_tier_slug) as pricing_plan,
      coalesce(sum(line.quantity) filter (where line.meter_key in (
        'input_tokens', 'input_text_tokens', 'cached_read_tokens', 'cached_read_text_tokens',
        'implicit_cached_input_text_tokens', 'cached_write_tokens', 'cached_write_text_tokens',
        'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
      )), 0) as input_tokens,
      coalesce(sum(line.quantity) filter (where line.meter_key in ('output_tokens', 'output_text_tokens')), 0) as output_tokens,
      coalesce(sum(line.quantity) filter (where line.meter_key in (
        'cached_read_tokens', 'cached_read_text_tokens', 'implicit_cached_input_text_tokens'
      )), 0) as cached_read_tokens,
      coalesce(sum(line.quantity) filter (where line.meter_key in (
        'cached_write_tokens', 'cached_write_text_tokens', 'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
      )), 0) as cached_write_tokens,
      coalesce(sum(line.charged_nanos) filter (where line.meter_key in (
        'input_tokens', 'input_text_tokens', 'cached_read_tokens', 'cached_read_text_tokens',
        'implicit_cached_input_text_tokens', 'cached_write_tokens', 'cached_write_text_tokens',
        'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
      )), 0) as input_cost_nanos,
      coalesce(sum(line.charged_nanos) filter (where line.meter_key in ('output_tokens', 'output_text_tokens')), 0) as output_cost_nanos,
      coalesce(sum(line.charged_nanos), 0) as total_cost_nanos
    from public.v2_request_pricing_lines line
    left join public.v2_pricing_skus sku on sku.sku_id = line.sku_id
    where line.request_event_id = source_fact.request_event_id
    group by public.resolve_v2_effective_pricing_plan(source_service_tier, sku.service_tier_slug)
  loop
    if tg_when = 'BEFORE' then
      update public.v2_public_effective_pricing_daily set
        input_tokens = greatest(0, input_tokens - totals.input_tokens),
        output_tokens = greatest(0, output_tokens - totals.output_tokens),
        cached_read_tokens = greatest(0, cached_read_tokens - totals.cached_read_tokens),
        cached_write_tokens = greatest(0, cached_write_tokens - totals.cached_write_tokens),
        input_cost_nanos = greatest(0, input_cost_nanos - totals.input_cost_nanos),
        output_cost_nanos = greatest(0, output_cost_nanos - totals.output_cost_nanos),
        total_cost_nanos = greatest(0, total_cost_nanos - totals.total_cost_nanos),
        updated_at = now()
      where model_slug = target_model and usage_date = target_date
        and provider_id = target_provider and pricing_plan = totals.pricing_plan;
    else
      insert into public.v2_public_effective_pricing_daily (
        model_slug, usage_date, provider_id, pricing_plan, input_tokens, output_tokens,
        cached_read_tokens, cached_write_tokens, input_cost_nanos, output_cost_nanos, total_cost_nanos
      ) values (
        target_model, target_date, target_provider, totals.pricing_plan, totals.input_tokens,
        totals.output_tokens, totals.cached_read_tokens, totals.cached_write_tokens,
        totals.input_cost_nanos, totals.output_cost_nanos, totals.total_cost_nanos
      ) on conflict (model_slug, usage_date, provider_id, pricing_plan) do update set
        input_tokens = public.v2_public_effective_pricing_daily.input_tokens + excluded.input_tokens,
        output_tokens = public.v2_public_effective_pricing_daily.output_tokens + excluded.output_tokens,
        cached_read_tokens = public.v2_public_effective_pricing_daily.cached_read_tokens + excluded.cached_read_tokens,
        cached_write_tokens = public.v2_public_effective_pricing_daily.cached_write_tokens + excluded.cached_write_tokens,
        input_cost_nanos = public.v2_public_effective_pricing_daily.input_cost_nanos + excluded.input_cost_nanos,
        output_cost_nanos = public.v2_public_effective_pricing_daily.output_cost_nanos + excluded.output_cost_nanos,
        total_cost_nanos = public.v2_public_effective_pricing_daily.total_cost_nanos + excluded.total_cost_nanos,
        updated_at = now();
    end if;
  end loop;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."sync_v2_public_effective_pricing_fact_update"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_v2_public_effective_pricing_fact_update"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_v2_public_effective_pricing_fact_update"() FROM PUBLIC, "anon", "authenticated", "service_role";

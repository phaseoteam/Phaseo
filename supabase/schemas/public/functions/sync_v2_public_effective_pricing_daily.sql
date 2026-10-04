CREATE OR REPLACE FUNCTION public.sync_v2_public_effective_pricing_daily()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  source_line public.v2_request_pricing_lines%rowtype;
  direction integer;
  target_model text;
  target_date date;
  target_provider text;
  target_plan text;
  is_input boolean;
  is_output boolean;
  is_cached_read boolean;
  is_cached_write boolean;
begin
  if tg_op = 'DELETE' then
    source_line := old;
    direction := -1;
  else
    source_line := new;
    direction := 1;
  end if;

  select
    coalesce(fact.routed_model_slug, fact.requested_model_slug),
    fact.occurred_at::date,
    route.provider_slug,
    public.resolve_v2_effective_pricing_plan(fact.service_tier_slug, sku.service_tier_slug)
  into target_model, target_date, target_provider, target_plan
  from public.v2_request_facts fact
  join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
  left join public.v2_pricing_skus sku on sku.sku_id = source_line.sku_id
  where fact.request_event_id = source_line.request_event_id;

  if target_model is null or target_provider is null then return source_line; end if;

  is_cached_read := source_line.meter_key in (
    'cached_read_tokens', 'cached_read_text_tokens', 'implicit_cached_input_text_tokens'
  );
  is_cached_write := source_line.meter_key in (
    'cached_write_tokens', 'cached_write_text_tokens',
    'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
  );
  is_input := source_line.meter_key in ('input_tokens', 'input_text_tokens') or is_cached_read or is_cached_write;
  is_output := source_line.meter_key in ('output_tokens', 'output_text_tokens');

  if direction = -1 then
    update public.v2_public_effective_pricing_daily set
      input_tokens = greatest(0, input_tokens - case when is_input then source_line.quantity else 0 end),
      output_tokens = greatest(0, output_tokens - case when is_output then source_line.quantity else 0 end),
      cached_read_tokens = greatest(0, cached_read_tokens - case when is_cached_read then source_line.quantity else 0 end),
      cached_write_tokens = greatest(0, cached_write_tokens - case when is_cached_write then source_line.quantity else 0 end),
      input_cost_nanos = greatest(0, input_cost_nanos - case when is_input then source_line.charged_nanos else 0 end),
      output_cost_nanos = greatest(0, output_cost_nanos - case when is_output then source_line.charged_nanos else 0 end),
      total_cost_nanos = greatest(0, total_cost_nanos - source_line.charged_nanos),
      updated_at = now()
    where model_slug = target_model
      and usage_date = target_date
      and provider_id = target_provider
      and pricing_plan = target_plan;
    return source_line;
  end if;

  insert into public.v2_public_effective_pricing_daily (
    model_slug, usage_date, provider_id, pricing_plan,
    input_tokens, output_tokens, cached_read_tokens, cached_write_tokens,
    input_cost_nanos, output_cost_nanos, total_cost_nanos
  ) values (
    target_model, target_date, target_provider, target_plan,
    case when is_input then source_line.quantity else 0 end,
    case when is_output then source_line.quantity else 0 end,
    case when is_cached_read then source_line.quantity else 0 end,
    case when is_cached_write then source_line.quantity else 0 end,
    case when is_input then source_line.charged_nanos else 0 end,
    case when is_output then source_line.charged_nanos else 0 end,
    source_line.charged_nanos
  )
  on conflict (model_slug, usage_date, provider_id, pricing_plan) do update set
    input_tokens = greatest(0, public.v2_public_effective_pricing_daily.input_tokens + excluded.input_tokens),
    output_tokens = greatest(0, public.v2_public_effective_pricing_daily.output_tokens + excluded.output_tokens),
    cached_read_tokens = greatest(0, public.v2_public_effective_pricing_daily.cached_read_tokens + excluded.cached_read_tokens),
    cached_write_tokens = greatest(0, public.v2_public_effective_pricing_daily.cached_write_tokens + excluded.cached_write_tokens),
    input_cost_nanos = greatest(0, public.v2_public_effective_pricing_daily.input_cost_nanos + excluded.input_cost_nanos),
    output_cost_nanos = greatest(0, public.v2_public_effective_pricing_daily.output_cost_nanos + excluded.output_cost_nanos),
    total_cost_nanos = greatest(0, public.v2_public_effective_pricing_daily.total_cost_nanos + excluded.total_cost_nanos),
    updated_at = now();

  return source_line;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."sync_v2_public_effective_pricing_daily"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_v2_public_effective_pricing_daily"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_v2_public_effective_pricing_daily"() FROM PUBLIC, "anon", "authenticated", "service_role";

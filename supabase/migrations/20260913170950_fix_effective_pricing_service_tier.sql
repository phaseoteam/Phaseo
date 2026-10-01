-- Attribute effective pricing to the request's canonical service tier.
--
-- The original aggregate grouped lines by the selected SKU's tier. During
-- ingestion, the SKU lookup did not filter by service tier, so a Standard
-- request could be paired with a DeepInfra Flex SKU and displayed as Flex even
-- though its charged nanos matched the Standard rate.
--
-- Request facts already persist the canonical tier. Prefer that fact for all
-- aggregate reads and retain the SKU tier only as a legacy fallback. A legacy
-- free offer is a pricing-plan override, not a canonical request tier.

create or replace function public.resolve_v2_effective_pricing_plan(
  p_fact_tier text,
  p_sku_tier text
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case lower(nullif(trim(p_sku_tier), ''))
    when 'free' then 'free'
    else coalesce(
      public.normalize_v2_service_tier(p_fact_tier),
      public.normalize_v2_service_tier(p_sku_tier),
      'standard'
    )
  end;
$$;

revoke all on function public.resolve_v2_effective_pricing_plan(text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_v2_effective_pricing_plan(text, text)
  to service_role;

-- Keep the SKU foreign keys useful for request-level inspection as well as
-- aggregate attribution. The old ingestion RPC still accepts the same event
-- shape, but this trigger applies the fact's tier to its SKU lookup.
create or replace function public.set_v2_request_pricing_line_service_tier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_model_id text;
  v_occurred_at timestamptz;
  v_service_tier text;
  v_existing_sku_tier text;
  v_sku_id uuid;
  v_sku_meter_id uuid;
begin
  select
    fact.provider_model_id,
    fact.occurred_at,
    fact.service_tier_slug,
    lower(nullif(trim(sku.service_tier_slug), ''))
  into v_provider_model_id, v_occurred_at, v_service_tier, v_existing_sku_tier
  from public.v2_request_facts fact
  left join public.v2_pricing_skus sku on sku.sku_id = new.sku_id
  where fact.request_event_id = new.request_event_id;

  if v_provider_model_id is null or v_service_tier is null then
    return new;
  end if;
  if v_existing_sku_tier = 'free' then
    return new;
  end if;

  select sku.sku_id, sku_meter.sku_meter_id
  into v_sku_id, v_sku_meter_id
  from public.v2_pricing_skus sku
  join public.v2_pricing_sku_meters sku_meter
    on sku_meter.sku_id = sku.sku_id
   and sku_meter.meter_key = lower(trim(new.meter_key))
  where sku.provider_model_id = v_provider_model_id
    and coalesce(public.normalize_v2_service_tier(sku.service_tier_slug), 'standard') = v_service_tier
    and sku.status = 'active'
    and sku.effective_from <= v_occurred_at
    and (sku.effective_to is null or sku.effective_to > v_occurred_at)
  order by sku.version desc, sku.effective_from desc, sku.sku_id
  limit 1;

  if v_sku_id is not null then
    new.sku_id := v_sku_id;
    new.sku_meter_id := v_sku_meter_id;
  end if;
  return new;
end;
$$;

revoke all on function public.set_v2_request_pricing_line_service_tier()
  from public, anon, authenticated;
grant execute on function public.set_v2_request_pricing_line_service_tier()
  to service_role;

drop trigger if exists v2_request_pricing_lines_service_tier on public.v2_request_pricing_lines;
create trigger v2_request_pricing_lines_service_tier
before insert or update of request_event_id, sku_id, sku_meter_id, meter_key
on public.v2_request_pricing_lines
for each row execute function public.set_v2_request_pricing_line_service_tier();

create or replace function public.set_v2_request_usage_service_tier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.set_v2_request_usage_service_tier()
  from public, anon, authenticated;
grant execute on function public.set_v2_request_usage_service_tier()
  to service_role;

drop trigger if exists v2_request_usage_service_tier on public.v2_request_usage;
create trigger v2_request_usage_service_tier
before insert or update of request_event_id, sku_meter_id, meter_key
on public.v2_request_usage
for each row execute function public.set_v2_request_usage_service_tier();

-- Reclassify only contributions whose source rows still exist. Request facts
-- and pricing lines can be removed by the BYOK retention job, while this
-- aggregate intentionally retains those historical contributions. Subtracting
-- the old live-source view and adding the corrected live-source view preserves
-- pruned history instead of erasing it during the repair.
create temporary table v2_effective_pricing_live_old on commit drop as
select
  coalesce(fact.routed_model_slug, fact.requested_model_slug) as model_slug,
  fact.occurred_at::date as usage_date,
  route.provider_slug as provider_id,
  coalesce(sku.service_tier_slug, 'standard') as pricing_plan,
  coalesce(sum(line.quantity) filter (where line.meter_key in (
    'input_tokens', 'input_text_tokens', 'cached_read_tokens', 'cached_read_text_tokens', 'implicit_cached_input_text_tokens',
    'cached_write_tokens', 'cached_write_text_tokens', 'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
  )), 0) as input_tokens,
  coalesce(sum(line.quantity) filter (where line.meter_key in ('output_tokens', 'output_text_tokens')), 0) as output_tokens,
  coalesce(sum(line.quantity) filter (where line.meter_key in (
    'cached_read_tokens', 'cached_read_text_tokens', 'implicit_cached_input_text_tokens'
  )), 0) as cached_read_tokens,
  coalesce(sum(line.quantity) filter (where line.meter_key in (
    'cached_write_tokens', 'cached_write_text_tokens', 'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
  )), 0) as cached_write_tokens,
  coalesce(sum(line.charged_nanos) filter (where line.meter_key in (
    'input_tokens', 'input_text_tokens', 'cached_read_tokens', 'cached_read_text_tokens', 'implicit_cached_input_text_tokens',
    'cached_write_tokens', 'cached_write_text_tokens', 'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
  )), 0) as input_cost_nanos,
  coalesce(sum(line.charged_nanos) filter (where line.meter_key in ('output_tokens', 'output_text_tokens')), 0) as output_cost_nanos,
  coalesce(sum(line.charged_nanos), 0) as total_cost_nanos
from public.v2_request_pricing_lines line
join public.v2_request_facts fact on fact.request_event_id = line.request_event_id
join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
left join public.v2_pricing_skus sku on sku.sku_id = line.sku_id
where coalesce(fact.routed_model_slug, fact.requested_model_slug) is not null
group by
  coalesce(fact.routed_model_slug, fact.requested_model_slug),
  fact.occurred_at::date,
  route.provider_slug,
  coalesce(sku.service_tier_slug, 'standard')
having sum(line.quantity) > 0 or sum(line.charged_nanos) > 0;

create temporary table v2_effective_pricing_live_new on commit drop as
select
  coalesce(fact.routed_model_slug, fact.requested_model_slug) as model_slug,
  fact.occurred_at::date as usage_date,
  route.provider_slug as provider_id,
  public.resolve_v2_effective_pricing_plan(fact.service_tier_slug, sku.service_tier_slug) as pricing_plan,
  coalesce(sum(line.quantity) filter (where line.meter_key in (
    'input_tokens', 'input_text_tokens', 'cached_read_tokens', 'cached_read_text_tokens', 'implicit_cached_input_text_tokens',
    'cached_write_tokens', 'cached_write_text_tokens', 'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
  )), 0) as input_tokens,
  coalesce(sum(line.quantity) filter (where line.meter_key in ('output_tokens', 'output_text_tokens')), 0) as output_tokens,
  coalesce(sum(line.quantity) filter (where line.meter_key in (
    'cached_read_tokens', 'cached_read_text_tokens', 'implicit_cached_input_text_tokens'
  )), 0) as cached_read_tokens,
  coalesce(sum(line.quantity) filter (where line.meter_key in (
    'cached_write_tokens', 'cached_write_text_tokens', 'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
  )), 0) as cached_write_tokens,
  coalesce(sum(line.charged_nanos) filter (where line.meter_key in (
    'input_tokens', 'input_text_tokens', 'cached_read_tokens', 'cached_read_text_tokens', 'implicit_cached_input_text_tokens',
    'cached_write_tokens', 'cached_write_text_tokens', 'cached_write_text_tokens_5m', 'cached_write_text_tokens_1h'
  )), 0) as input_cost_nanos,
  coalesce(sum(line.charged_nanos) filter (where line.meter_key in ('output_tokens', 'output_text_tokens')), 0) as output_cost_nanos,
  coalesce(sum(line.charged_nanos), 0) as total_cost_nanos
from public.v2_request_pricing_lines line
join public.v2_request_facts fact on fact.request_event_id = line.request_event_id
join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
left join public.v2_pricing_skus sku on sku.sku_id = line.sku_id
where coalesce(fact.routed_model_slug, fact.requested_model_slug) is not null
group by
  coalesce(fact.routed_model_slug, fact.requested_model_slug),
  fact.occurred_at::date,
  route.provider_slug,
  public.resolve_v2_effective_pricing_plan(fact.service_tier_slug, sku.service_tier_slug)
having sum(line.quantity) > 0 or sum(line.charged_nanos) > 0;

update public.v2_public_effective_pricing_daily daily
set
  input_tokens = greatest(0, daily.input_tokens - live_old.input_tokens),
  output_tokens = greatest(0, daily.output_tokens - live_old.output_tokens),
  cached_read_tokens = greatest(0, daily.cached_read_tokens - live_old.cached_read_tokens),
  cached_write_tokens = greatest(0, daily.cached_write_tokens - live_old.cached_write_tokens),
  input_cost_nanos = greatest(0, daily.input_cost_nanos - live_old.input_cost_nanos),
  output_cost_nanos = greatest(0, daily.output_cost_nanos - live_old.output_cost_nanos),
  total_cost_nanos = greatest(0, daily.total_cost_nanos - live_old.total_cost_nanos),
  updated_at = now()
from v2_effective_pricing_live_old live_old
where daily.model_slug = live_old.model_slug
  and daily.usage_date = live_old.usage_date
  and daily.provider_id = live_old.provider_id
  and daily.pricing_plan = live_old.pricing_plan;

insert into public.v2_public_effective_pricing_daily (
  model_slug, usage_date, provider_id, pricing_plan,
  input_tokens, output_tokens, cached_read_tokens, cached_write_tokens,
  input_cost_nanos, output_cost_nanos, total_cost_nanos
)
select
  model_slug, usage_date, provider_id, pricing_plan,
  input_tokens, output_tokens, cached_read_tokens, cached_write_tokens,
  input_cost_nanos, output_cost_nanos, total_cost_nanos
from v2_effective_pricing_live_new
on conflict (model_slug, usage_date, provider_id, pricing_plan) do update set
  input_tokens = public.v2_public_effective_pricing_daily.input_tokens + excluded.input_tokens,
  output_tokens = public.v2_public_effective_pricing_daily.output_tokens + excluded.output_tokens,
  cached_read_tokens = public.v2_public_effective_pricing_daily.cached_read_tokens + excluded.cached_read_tokens,
  cached_write_tokens = public.v2_public_effective_pricing_daily.cached_write_tokens + excluded.cached_write_tokens,
  input_cost_nanos = public.v2_public_effective_pricing_daily.input_cost_nanos + excluded.input_cost_nanos,
  output_cost_nanos = public.v2_public_effective_pricing_daily.output_cost_nanos + excluded.output_cost_nanos,
  total_cost_nanos = public.v2_public_effective_pricing_daily.total_cost_nanos + excluded.total_cost_nanos,
  updated_at = now();

create or replace function public.sync_v2_public_effective_pricing_daily()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.sync_v2_public_effective_pricing_daily()
  from public, anon, authenticated;

drop trigger if exists sync_v2_public_effective_pricing_daily on public.v2_request_pricing_lines;
create trigger sync_v2_public_effective_pricing_daily
after insert or delete on public.v2_request_pricing_lines
for each row execute function public.sync_v2_public_effective_pricing_daily();

-- Request ingestion updates the fact before replacing its pricing lines. Move
-- existing line totals between buckets when the effective tier changes.
create or replace function public.sync_v2_public_effective_pricing_fact_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.sync_v2_public_effective_pricing_fact_update()
  from public, anon, authenticated;

drop trigger if exists sync_v2_public_effective_pricing_fact_before_update on public.v2_request_facts;
drop trigger if exists sync_v2_public_effective_pricing_fact_after_update on public.v2_request_facts;
create trigger sync_v2_public_effective_pricing_fact_before_update
before update on public.v2_request_facts
for each row execute function public.sync_v2_public_effective_pricing_fact_update();
create trigger sync_v2_public_effective_pricing_fact_after_update
after update on public.v2_request_facts
for each row execute function public.sync_v2_public_effective_pricing_fact_update();

comment on table public.v2_public_effective_pricing_daily is
  'Public daily model pricing aggregates from charged request lines, separated by authoritative provider service tier.';

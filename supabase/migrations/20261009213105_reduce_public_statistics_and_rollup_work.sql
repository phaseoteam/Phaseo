-- phaseo:allow-destructive-migration reason: Replaces functions only; existing rebuild logic deletes derived rollup rows and truncates temporary batches, but the migration executes no deletion or rebuild and preserves all source and financial records.
set local lock_timeout = '500ms';
set local statement_timeout = '15s';

SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_monitor_model_rows (
  p_include_hidden boolean DEFAULT false
)
  RETURNS TABLE (
    model_id                     text,
    model_name                   text,
    model_release_date           date,
    model_retirement_date        date,
    model_status                 text,
    model_input_types            text,
    model_output_types           text,
    organisation_id              text,
    organisation_name            text,
    hidden                       boolean,
    provider_api_model_id        text,
    provider_id                  text,
    api_model_id                 text,
    provider_model_slug          text,
    is_active_gateway            boolean,
    input_modalities             text[],
    output_modalities            text[],
    quantization_scheme          text,
    context_length               integer,
    provider_max_output_tokens   integer,
    effective_from               timestamp with time zone,
    effective_to                 timestamp with time zone,
    capability_id                text,
    capability_params            jsonb,
    capability_status            text,
    capability_max_input_tokens  integer,
    capability_max_output_tokens integer,
    api_provider_name            text,
    provider_link                text,
    input_price                  numeric,
    output_price                 numeric,
    standard_input_price         numeric,
    standard_output_price        numeric,
    standard_input_price_label   text,
    standard_input_price_unit    text,
    standard_output_price_label  text,
    standard_output_price_unit   text,
    from_price                   numeric,
    from_price_unit              text,
    pricing_tier                 text,
    is_free_variant              boolean,
    weekly_tokens_model          bigint,
    weekly_tokens_model_provider bigint,
    weekly_throughput_model      numeric,
    weekly_latency_model         numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  with weekly_request_groups as materialized (
    -- Resolve model aliases once per group, rather than once per request.
    -- Keep sums and counts separate so combining aliases preserves averages.
    select
      gr.canonical_model_id,
      gr.model_id,
      gr.provider,
      sum(public.gateway_usage_total_tokens(gr.usage)) as total_tokens,
      sum(gr.throughput::numeric) as throughput_sum,
      count(gr.throughput) as throughput_count,
      sum(gr.latency_ms::numeric) as latency_sum,
      count(gr.latency_ms) as latency_count
    from private.v2_rpc_gateway_requests_compat gr
    where gr.created_at >= now() - interval '7 days'
    group by gr.canonical_model_id, gr.model_id, gr.provider
  ),
  normalized_weekly_requests as materialized (
    select
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.model_id, '')
      ) as canonical_model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      gr.total_tokens,
      gr.throughput_sum,
      gr.throughput_count,
      gr.latency_sum,
      gr.latency_count
    from weekly_request_groups gr
  ),
  weekly_model_usage as (
    select
      r.canonical_model_id as model_id,
      sum(r.total_tokens)::bigint as weekly_tokens_model,
      round(sum(r.throughput_sum) / nullif(sum(r.throughput_count), 0), 2) as weekly_throughput_model,
      round(sum(r.latency_sum) / nullif(sum(r.latency_count), 0), 0) as weekly_latency_model
    from normalized_weekly_requests r
    where r.canonical_model_id is not null
    group by r.canonical_model_id
  ),
  weekly_model_provider_usage as (
    select
      r.canonical_model_id as model_id,
      r.provider_id,
      sum(r.total_tokens)::bigint as weekly_tokens_model_provider
    from normalized_weekly_requests r
    where r.canonical_model_id is not null
      and r.provider_id <> 'unknown'
    group by r.canonical_model_id, r.provider_id
  ),
  active_pricing_rules as (
    select
      pr.model_key,
      pr.meter,
      pr.unit,
      pr.unit_size,
      pr.price_per_unit,
      coalesce(nullif(lower(pr.pricing_plan), ''), 'standard') as pricing_plan,
      case
        when lower(coalesce(pr.meter, '')) like '%token%'
          or lower(coalesce(pr.unit, '')) in ('token', 'tokens')
          then pr.price_per_unit * (1000000 / nullif(pr.unit_size, 0))
        when lower(coalesce(pr.unit, '')) in ('minute', 'minutes', 'min', 'mins', 'm')
          then pr.price_per_unit / nullif(pr.unit_size, 0) / 60
        when lower(coalesce(pr.unit, '')) in ('hour', 'hours', 'hr', 'hrs', 'h')
          then pr.price_per_unit / nullif(pr.unit_size, 0) / 3600
        else pr.price_per_unit / nullif(pr.unit_size, 0)
      end as display_price,
      case
        when lower(coalesce(pr.meter, '')) like '%token%'
          or lower(coalesce(pr.unit, '')) in ('token', 'tokens')
          then '1M tokens'
        when lower(coalesce(pr.unit, '')) in ('minute', 'minutes', 'min', 'mins', 'm')
          then 'second'
        when lower(coalesce(pr.unit, '')) in ('hour', 'hours', 'hr', 'hrs', 'h')
          then 'second'
        when lower(coalesce(pr.unit, '')) in ('second', 'seconds', 'sec', 'secs', 's')
          then 'second'
        when lower(coalesce(pr.unit, '')) in ('image', 'images')
          then 'image'
        when lower(coalesce(pr.unit, '')) in ('video', 'videos')
          then 'video'
        when lower(coalesce(pr.unit, '')) in ('character', 'characters', 'char', 'chars')
          then 'character'
        else nullif(lower(coalesce(pr.unit, '')), '')
      end as display_unit,
      case
        when lower(coalesce(pr.meter, '')) in ('input_text_tokens', 'input_tokens') then 'input'
        when lower(coalesce(pr.meter, '')) = 'input_audio_tokens' then 'input'
        when lower(coalesce(pr.meter, '')) = 'input_image_tokens' then 'input'
        when lower(coalesce(pr.meter, '')) = 'input_video_tokens' then 'input'
        when lower(coalesce(pr.meter, '')) in ('output_text_tokens', 'output_tokens') then 'output'
        when lower(coalesce(pr.meter, '')) = 'output_audio_tokens' then 'output'
        when lower(coalesce(pr.meter, '')) = 'output_image_tokens' then 'output'
        when lower(coalesce(pr.meter, '')) = 'output_video_tokens' then 'output'
        else null
      end as standard_side,
      case
        when lower(coalesce(pr.meter, '')) in ('input_text_tokens', 'input_tokens') then 'Text Input'
        when lower(coalesce(pr.meter, '')) = 'input_audio_tokens' then 'Audio Input'
        when lower(coalesce(pr.meter, '')) = 'input_image_tokens' then 'Image Input'
        when lower(coalesce(pr.meter, '')) = 'input_video_tokens' then 'Video Input'
        when lower(coalesce(pr.meter, '')) in ('output_text_tokens', 'output_tokens') then 'Text Output'
        when lower(coalesce(pr.meter, '')) = 'output_audio_tokens' then 'Audio Output'
        when lower(coalesce(pr.meter, '')) = 'output_image_tokens' then 'Image Output'
        when lower(coalesce(pr.meter, '')) = 'output_video_tokens' then 'Video Output'
        else null
      end as standard_label,
      case
        when lower(coalesce(pr.meter, '')) in ('input_text_tokens', 'input_tokens', 'output_text_tokens', 'output_tokens') then 0
        when lower(coalesce(pr.meter, '')) in ('input_audio_tokens', 'output_audio_tokens') then 1
        when lower(coalesce(pr.meter, '')) in ('input_image_tokens', 'output_image_tokens') then 2
        when lower(coalesce(pr.meter, '')) in ('input_video_tokens', 'output_video_tokens') then 3
        else 99
      end as standard_priority
    from private.v2_rpc_pricing_compat pr
    where (pr.effective_from is null or pr.effective_from <= now())
      and (pr.effective_to is null or now() < pr.effective_to)
  ),
  provider_rows as (
    select
      pm.*,
      coalesce(
        nullif(btrim(pm.model_id), ''),
        public.resolve_public_model_id(nullif(btrim(pm.api_model_id), ''), pm.provider_id),
        nullif(btrim(pm.api_model_id), '')
      ) as canonical_model_id
    from private.v2_rpc_routes_compat pm
    where pm.api_model_id is not null
      and btrim(pm.api_model_id) <> ''
  ),
  ranked_standard_rules as (
    select
      apr.model_key,
      apr.standard_side,
      apr.standard_label,
      apr.display_unit,
      apr.display_price,
      row_number() over (
        partition by apr.model_key, apr.standard_side
        order by apr.standard_priority asc, apr.display_price asc nulls last, apr.standard_label asc
      ) as row_num
    from active_pricing_rules apr
    where apr.pricing_plan = 'standard'
      and apr.standard_side is not null
      and apr.display_price is not null
      and apr.display_unit is not null
  ),
  standard_price_choices as (
    select
      rsr.model_key,
      max(case when rsr.standard_side = 'input' and rsr.row_num = 1 then rsr.display_price end) as standard_input_price,
      max(case when rsr.standard_side = 'output' and rsr.row_num = 1 then rsr.display_price end) as standard_output_price,
      max(case when rsr.standard_side = 'input' and rsr.row_num = 1 then rsr.standard_label end) as standard_input_price_label,
      max(case when rsr.standard_side = 'input' and rsr.row_num = 1 then rsr.display_unit end) as standard_input_price_unit,
      max(case when rsr.standard_side = 'output' and rsr.row_num = 1 then rsr.standard_label end) as standard_output_price_label,
      max(case when rsr.standard_side = 'output' and rsr.row_num = 1 then rsr.display_unit end) as standard_output_price_unit
    from ranked_standard_rules rsr
    group by rsr.model_key
  ),
  pricing_summary as (
    select
      apr.model_key,
      min(apr.price_per_unit * (1000000 / nullif(apr.unit_size, 0))) filter (
        where apr.pricing_plan = 'standard'
          and lower(coalesce(apr.meter, '')) in ('input_text_tokens', 'input_tokens')
      ) as input_price,
      min(apr.price_per_unit * (1000000 / nullif(apr.unit_size, 0))) filter (
        where apr.pricing_plan = 'standard'
          and lower(coalesce(apr.meter, '')) in ('output_text_tokens', 'output_tokens')
      ) as output_price,
      spc.standard_input_price,
      spc.standard_output_price,
      spc.standard_input_price_label,
      spc.standard_input_price_unit,
      spc.standard_output_price_label,
      spc.standard_output_price_unit,
      case
        when count(distinct apr.display_unit) filter (
          where apr.display_price is not null
            and apr.display_unit is not null
        ) = 1
          then min(apr.display_price) filter (
            where apr.display_price is not null
              and apr.display_unit is not null
          )
        else null
      end as from_price,
      case
        when count(distinct apr.display_unit) filter (
          where apr.display_price is not null
            and apr.display_unit is not null
        ) = 1
          then min(apr.display_unit) filter (
            where apr.display_price is not null
              and apr.display_unit is not null
          )
        else null
      end as from_price_unit,
      case
        when apr.model_key like '%:free:%' then 'free'
        when bool_or(apr.pricing_plan = 'standard') then 'standard'
        else min(apr.pricing_plan)
      end as pricing_tier
    from active_pricing_rules apr
    left join standard_price_choices spc
      on spc.model_key = apr.model_key
    group by
      apr.model_key,
      spc.standard_input_price,
      spc.standard_output_price,
      spc.standard_input_price_label,
      spc.standard_input_price_unit,
      spc.standard_output_price_label,
      spc.standard_output_price_unit
  )
  select
    pm.canonical_model_id as model_id,
    dm.name as model_name,
    dm.release_date as model_release_date,
    dm.retirement_date as model_retirement_date,
    dm.status as model_status,
    dm.input_types as model_input_types,
    dm.output_types as model_output_types,
    dm.organisation_id,
    org.name as organisation_name,
    coalesce(dm.hidden, false) as hidden,
    pm.provider_api_model_id,
    pm.provider_id,
    pm.api_model_id,
    pm.provider_model_slug,
    pm.is_active_gateway,
    pm.input_modalities,
    pm.output_modalities,
    pm.quantization_scheme,
    pm.context_length,
    pm.max_output_tokens as provider_max_output_tokens,
    pm.effective_from,
    pm.effective_to,
    cap.capability_id,
    cap.params as capability_params,
    cap.status as capability_status,
    cap.max_input_tokens as capability_max_input_tokens,
    cap.max_output_tokens as capability_max_output_tokens,
    provider.api_provider_name,
    provider.link as provider_link,
    ps.input_price,
    ps.output_price,
    ps.standard_input_price,
    ps.standard_output_price,
    ps.standard_input_price_label,
    ps.standard_input_price_unit,
    ps.standard_output_price_label,
    ps.standard_output_price_unit,
    ps.from_price,
    ps.from_price_unit,
    coalesce(ps.pricing_tier, case when pm.api_model_id like '%:free%' then 'free' else 'standard' end) as pricing_tier,
    (pm.api_model_id like '%:free%') as is_free_variant,
    wmu.weekly_tokens_model,
    wmpu.weekly_tokens_model_provider,
    wmu.weekly_throughput_model,
    wmu.weekly_latency_model
  from provider_rows pm
  join private.v2_rpc_capabilities_compat cap
    on cap.provider_api_model_id = pm.provider_api_model_id
  left join private.v2_rpc_models_compat dm
    on dm.model_id = pm.canonical_model_id
  left join private.v2_rpc_labs_compat org
    on org.organisation_id = dm.organisation_id
  left join private.v2_rpc_providers_compat provider
    on provider.api_provider_id = pm.provider_id
  left join pricing_summary ps
    on ps.model_key = pm.provider_id || ':' || pm.api_model_id || ':' || cap.capability_id
  left join weekly_model_usage wmu
    on wmu.model_id = pm.canonical_model_id
  left join weekly_model_provider_usage wmpu
    on wmpu.model_id = pm.canonical_model_id
   and wmpu.provider_id = pm.provider_id
  where (p_include_hidden or coalesce(dm.hidden, false) = false)
  order by pm.provider_api_model_id asc, cap.capability_id asc;
$function$;

CREATE OR REPLACE FUNCTION public.process_v2_analytics_outbox (
  p_limit integer DEFAULT 250
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 2000));
  v_selected integer := 0;
  v_coalesced integer := 0;
  v_private_grains integer := 0;
  v_public_daily_grains integer := 0;
  v_public_hourly_grains integer := 0;
  v_rollup_id uuid;
  grain record;
begin
  -- Different event batches can rebuild the same summary concurrently.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('public.process_v2_analytics_outbox', 0)) then
    return jsonb_build_object('selected', 0, 'coalesced', 0, 'private_grains', 0,
      'public_daily_grains', 0, 'public_hourly_grains', 0, 'skipped_locked', true);
  end if;
  create temporary table if not exists pg_temp.v2_rollup_batch (
    request_event_id uuid primary key,
    workspace_id uuid not null,
    occurred_at timestamptz not null,
    app_id uuid,
    model_slug text,
    provider_model_id text,
    cloudflare_colo text
  ) on commit drop;
  truncate table pg_temp.v2_rollup_batch;

  insert into pg_temp.v2_rollup_batch (
    request_event_id, workspace_id, occurred_at, app_id, model_slug,
    provider_model_id, cloudflare_colo
  )
  select
    outbox.request_event_id,
    fact.workspace_id,
    fact.occurred_at,
    fact.app_id,
    coalesce(fact.routed_model_slug, fact.requested_model_slug),
    fact.provider_model_id,
    fact.cloudflare_colo
  from public.v2_analytics_outbox outbox
  join public.v2_request_facts fact on fact.request_event_id = outbox.request_event_id
  where outbox.status in ('pending', 'failed')
    and outbox.available_at <= now()
  order by outbox.occurred_at, outbox.request_event_id
  for update of outbox skip locked
  limit case when exists(select 1 from private.v2_analytics_previous_grains)
    then greatest(0,v_limit-least(5,v_limit)) else v_limit end;


  get diagnostics v_selected = row_count;
  create temporary table if not exists pg_temp.v2_previous_grain_batch
    (like private.v2_analytics_previous_grains including defaults) on commit drop;
  truncate table pg_temp.v2_previous_grain_batch;
  alter table pg_temp.v2_previous_grain_batch add column if not exists transaction_id bigint;
  insert into pg_temp.v2_previous_grain_batch(grain_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo,queued_at,transaction_id)
  select previous.* from private.v2_analytics_previous_grains previous
  order by previous.queued_at,previous.grain_id for update skip locked limit greatest(0,v_limit-v_selected);
  insert into pg_temp.v2_rollup_batch
    (request_event_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo)
  select grain_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo
  from pg_temp.v2_previous_grain_batch;
  v_selected := v_selected + (select count(*) from pg_temp.v2_previous_grain_batch);

  if v_selected = 0 then
    return jsonb_build_object(
      'selected', 0,
      'coalesced', 0,
      'private_grains', 0,
      'public_daily_grains', 0,
      'public_hourly_grains', 0
    );
  end if;

  -- The full-grain rebuild also includes other ready events in these same
  -- workspace/hour identities. Lock them before reading sources: corrections
  -- then re-enqueue after this transaction, even when an existing pending
  -- outbox upsert would otherwise have been a no-op. Cap all acknowledgments
  -- at 2,000; do not enlarge the set of summaries that must be rebuilt.
  create temporary table if not exists pg_temp.v2_rollup_covered (
    request_event_id uuid primary key
  ) on commit drop;
  truncate table pg_temp.v2_rollup_covered;
  insert into pg_temp.v2_rollup_covered
  select outbox.request_event_id
  from public.v2_analytics_outbox outbox
  join public.v2_request_facts fact on fact.request_event_id = outbox.request_event_id
  where outbox.status in ('pending', 'failed') and outbox.available_at <= now()
    and outbox.occurred_at >= (select date_trunc('hour', min(occurred_at)) from pg_temp.v2_rollup_batch)
    and outbox.occurred_at < (select date_trunc('hour', max(occurred_at)) + interval '1 hour' from pg_temp.v2_rollup_batch)
    and not exists (select 1 from pg_temp.v2_rollup_batch batch where batch.request_event_id = outbox.request_event_id)
    and exists (
      select 1 from pg_temp.v2_rollup_batch batch
      where batch.model_slug is not null and batch.workspace_id = fact.workspace_id
        and date_trunc('hour', batch.occurred_at) = date_trunc('hour', fact.occurred_at)
        and batch.app_id is not distinct from fact.app_id
        and batch.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
        and batch.provider_model_id is not distinct from fact.provider_model_id
        and batch.cloudflare_colo is not distinct from fact.cloudflare_colo
    )
  order by outbox.occurred_at, outbox.request_event_id
  for update of outbox skip locked
  limit greatest(0, least(2000, v_limit * 8) - v_selected);
  get diagnostics v_coalesced = row_count;

  update public.v2_analytics_outbox outbox
  set status = 'processing', updated_at = now()
  where outbox.request_event_id in (select batch.request_event_id from pg_temp.v2_rollup_batch batch)
     or outbox.request_event_id in (select covered.request_event_id from pg_temp.v2_rollup_covered covered);

  for grain in
    select distinct
      batch.workspace_id,
      batch.occurred_at::date as usage_date,
      batch.app_id,
      batch.model_slug,
      batch.provider_model_id,
      batch.cloudflare_colo
    from pg_temp.v2_rollup_batch batch
    where batch.model_slug is not null
  loop
    delete from public.v2_private_usage_daily rollup
    where rollup.workspace_id = grain.workspace_id
      and rollup.usage_date = grain.usage_date
      and rollup.app_id is not distinct from grain.app_id
      and rollup.model_slug = grain.model_slug
      and rollup.provider_model_id is not distinct from grain.provider_model_id
      and rollup.cloudflare_colo is not distinct from grain.cloudflare_colo;

    insert into public.v2_private_usage_daily (
      usage_date, workspace_id, app_id, model_slug, provider_model_id, cloudflare_colo,
      requests, successful_requests, failed_requests, rate_limited_requests,
      tool_call_count, tool_call_requests, tool_call_successes,
      structured_output_attempts, structured_output_successes,
      latency_sum_ms, latency_count, generation_sum_ms, generation_count,
      throughput_sum, throughput_count, gateway_total_sum_ms, gateway_total_count,
      internal_dispatch_sum_ms, internal_dispatch_count,
      upstream_attempts, failed_upstream_attempts, cached_input_tokens, input_tokens, cost_nanos
    )
    select
      grain.usage_date, grain.workspace_id, grain.app_id, grain.model_slug,
      grain.provider_model_id, grain.cloudflare_colo,
      count(*), count(*) filter (where fact.success), count(*) filter (where not fact.success),
      count(*) filter (where fact.status_code = 429),
      coalesce(sum(fact.tool_call_count), 0),
      count(*) filter (where fact.tool_call_count > 0),
      count(*) filter (where fact.tool_call_count > 0 and fact.tool_call_succeeded is true),
      count(*) filter (where fact.structured_output_attempted),
      count(*) filter (where fact.structured_output_attempted and fact.structured_output_succeeded),
      coalesce(sum(fact.latency_ms), 0), count(fact.latency_ms),
      coalesce(sum(fact.generation_ms), 0), count(fact.generation_ms),
      coalesce(sum(fact.throughput), 0), count(fact.throughput),
      coalesce(sum(fact.gateway_total_ms), 0), count(fact.gateway_total_ms),
      coalesce(sum(fact.internal_dispatch_ms), 0), count(fact.internal_dispatch_ms),
      coalesce(sum(attempts.attempts), 0), coalesce(sum(attempts.failed_attempts), 0),
      coalesce(sum(usage.cached_input_tokens), 0), coalesce(sum(usage.input_tokens), 0),
      coalesce(sum(fact.cost_nanos), 0)
    from public.v2_request_facts fact
    left join lateral (
      select count(*)::bigint as attempts,
        count(*) filter (where not attempt.success)::bigint as failed_attempts
      from public.v2_request_attempts attempt
      where attempt.request_event_id = fact.request_event_id
    ) attempts on true
    left join lateral (
      select
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'cached_input_tokens'), 0) as cached_input_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'), 0) as input_tokens
      from public.v2_request_usage meter
      where meter.request_event_id = fact.request_event_id
    ) usage on true
    where fact.workspace_id = grain.workspace_id
      and fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    having count(*) > 0
    returning rollup_id into v_rollup_id;

    insert into public.v2_private_usage_daily_meters (
      rollup_id, meter_key, modality, unit, quantity
    )
    select v_rollup_id, meter.meter_key, meter.modality, meter.unit, sum(meter.quantity)
    from public.v2_request_usage meter
    join public.v2_request_facts fact on fact.request_event_id = meter.request_event_id
    where fact.workspace_id = grain.workspace_id
      and fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    group by meter.meter_key, meter.modality, meter.unit;

    v_private_grains := v_private_grains + 1;
  end loop;

  for grain in
    select distinct
      batch.occurred_at::date as usage_date,
      batch.app_id,
      batch.model_slug,
      batch.provider_model_id,
      batch.cloudflare_colo
    from pg_temp.v2_rollup_batch batch
    where batch.model_slug is not null
  loop
    delete from public.v2_public_usage_daily rollup
    where rollup.usage_date = grain.usage_date
      and rollup.app_id is not distinct from grain.app_id
      and rollup.model_slug = grain.model_slug
      and rollup.provider_model_id is not distinct from grain.provider_model_id
      and rollup.cloudflare_colo is not distinct from grain.cloudflare_colo;

    insert into public.v2_public_usage_daily (
      usage_date, app_id, model_slug, provider_model_id, cloudflare_colo,
      requests, successful_requests, failed_requests, rate_limited_requests,
      tool_call_count, tool_call_requests, tool_call_successes,
      structured_output_attempts, structured_output_successes,
      latency_sum_ms, latency_count, generation_sum_ms, generation_count,
      throughput_sum, throughput_count, gateway_total_sum_ms, gateway_total_count,
      internal_dispatch_sum_ms, internal_dispatch_count,
      upstream_attempts, failed_upstream_attempts, cached_input_tokens, input_tokens, cost_nanos
    )
    select
      grain.usage_date, grain.app_id, grain.model_slug, grain.provider_model_id, grain.cloudflare_colo,
      count(*), count(*) filter (where fact.success), count(*) filter (where not fact.success),
      count(*) filter (where fact.status_code = 429),
      coalesce(sum(fact.tool_call_count), 0),
      count(*) filter (where fact.tool_call_count > 0),
      count(*) filter (where fact.tool_call_count > 0 and fact.tool_call_succeeded is true),
      count(*) filter (where fact.structured_output_attempted),
      count(*) filter (where fact.structured_output_attempted and fact.structured_output_succeeded),
      coalesce(sum(fact.latency_ms), 0), count(fact.latency_ms),
      coalesce(sum(fact.generation_ms), 0), count(fact.generation_ms),
      coalesce(sum(fact.throughput), 0), count(fact.throughput),
      coalesce(sum(fact.gateway_total_ms), 0), count(fact.gateway_total_ms),
      coalesce(sum(fact.internal_dispatch_ms), 0), count(fact.internal_dispatch_ms),
      coalesce(sum(attempts.attempts), 0), coalesce(sum(attempts.failed_attempts), 0),
      coalesce(sum(usage.cached_input_tokens), 0), coalesce(sum(usage.input_tokens), 0),
      coalesce(sum(fact.cost_nanos), 0)
    from public.reporting_request_facts fact
    left join lateral (
      select count(*)::bigint as attempts,
        count(*) filter (where not attempt.success)::bigint as failed_attempts
      from public.v2_request_attempts attempt
      where attempt.request_event_id = fact.request_event_id
    ) attempts on true
    left join lateral (
      select
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'cached_input_tokens'), 0) as cached_input_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'), 0) as input_tokens
      from public.v2_request_usage meter
      where meter.request_event_id = fact.request_event_id
    ) usage on true
    where fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    having count(*) > 0
    returning rollup_id into v_rollup_id;

    insert into public.v2_public_usage_daily_meters (
      rollup_id, meter_key, modality, unit, quantity
    )
    select v_rollup_id, meter.meter_key, meter.modality, meter.unit, sum(meter.quantity)
    from public.v2_request_usage meter
    join public.reporting_request_facts fact on fact.request_event_id = meter.request_event_id
    where fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    group by meter.meter_key, meter.modality, meter.unit;

    v_public_daily_grains := v_public_daily_grains + 1;
  end loop;

  for grain in
    select distinct
      date_trunc('hour', batch.occurred_at) as bucket_start,
      batch.app_id,
      batch.model_slug,
      batch.provider_model_id,
      batch.cloudflare_colo
    from pg_temp.v2_rollup_batch batch
    where batch.model_slug is not null
  loop
    delete from public.v2_public_usage_hourly rollup
    where rollup.bucket_start = grain.bucket_start
      and rollup.app_id is not distinct from grain.app_id
      and rollup.model_slug = grain.model_slug
      and rollup.provider_model_id is not distinct from grain.provider_model_id
      and rollup.cloudflare_colo is not distinct from grain.cloudflare_colo;

    insert into public.v2_public_usage_hourly (
      bucket_start, app_id, model_slug, provider_model_id, cloudflare_colo,
      requests, successful_requests, failed_requests, rate_limited_requests,
      tool_call_count, tool_call_requests, tool_call_successes,
      structured_output_attempts, structured_output_successes,
      latency_sum_ms, latency_count, generation_sum_ms, generation_count,
      throughput_sum, throughput_count, gateway_total_sum_ms, gateway_total_count,
      internal_dispatch_sum_ms, internal_dispatch_count,
      upstream_attempts, failed_upstream_attempts, cached_input_tokens, input_tokens, cost_nanos
    )
    select
      grain.bucket_start, grain.app_id, grain.model_slug, grain.provider_model_id, grain.cloudflare_colo,
      count(*), count(*) filter (where fact.success), count(*) filter (where not fact.success),
      count(*) filter (where fact.status_code = 429),
      coalesce(sum(fact.tool_call_count), 0),
      count(*) filter (where fact.tool_call_count > 0),
      count(*) filter (where fact.tool_call_count > 0 and fact.tool_call_succeeded is true),
      count(*) filter (where fact.structured_output_attempted),
      count(*) filter (where fact.structured_output_attempted and fact.structured_output_succeeded),
      coalesce(sum(fact.latency_ms), 0), count(fact.latency_ms),
      coalesce(sum(fact.generation_ms), 0), count(fact.generation_ms),
      coalesce(sum(fact.throughput), 0), count(fact.throughput),
      coalesce(sum(fact.gateway_total_ms), 0), count(fact.gateway_total_ms),
      coalesce(sum(fact.internal_dispatch_ms), 0), count(fact.internal_dispatch_ms),
      coalesce(sum(attempts.attempts), 0), coalesce(sum(attempts.failed_attempts), 0),
      coalesce(sum(usage.cached_input_tokens), 0), coalesce(sum(usage.input_tokens), 0),
      coalesce(sum(fact.cost_nanos), 0)
    from public.reporting_request_facts fact
    left join lateral (
      select count(*)::bigint as attempts,
        count(*) filter (where not attempt.success)::bigint as failed_attempts
      from public.v2_request_attempts attempt
      where attempt.request_event_id = fact.request_event_id
    ) attempts on true
    left join lateral (
      select
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'cached_input_tokens'), 0) as cached_input_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'), 0) as input_tokens
      from public.v2_request_usage meter
      where meter.request_event_id = fact.request_event_id
    ) usage on true
    where fact.occurred_at >= grain.bucket_start
      and fact.occurred_at < grain.bucket_start + interval '1 hour'
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    having count(*) > 0
    returning rollup_id into v_rollup_id;

    insert into public.v2_public_usage_hourly_meters (
      rollup_id, meter_key, modality, unit, quantity
    )
    select v_rollup_id, meter.meter_key, meter.modality, meter.unit, sum(meter.quantity)
    from public.v2_request_usage meter
    join public.reporting_request_facts fact on fact.request_event_id = meter.request_event_id
    where fact.occurred_at >= grain.bucket_start
      and fact.occurred_at < grain.bucket_start + interval '1 hour'
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    group by meter.meter_key, meter.modality, meter.unit;

    v_public_hourly_grains := v_public_hourly_grains + 1;
  end loop;

  insert into public.v2_rollup_refresh_state (
    rollup_name, bucket_start, last_started_at, last_completed_at, source_watermark, status, error_message, updated_at
  )
  select 'private_daily', date_trunc('day', batch.occurred_at), now(), now(), max(batch.occurred_at), 'complete', null, now()
  from pg_temp.v2_rollup_batch batch
  group by date_trunc('day', batch.occurred_at)
  on conflict (rollup_name, bucket_start) do update set
    last_started_at = excluded.last_started_at,
    last_completed_at = excluded.last_completed_at,
    source_watermark = excluded.source_watermark,
    status = excluded.status,
    error_message = null,
    updated_at = now();

  insert into public.v2_rollup_refresh_state (
    rollup_name, bucket_start, last_started_at, last_completed_at, source_watermark, status, error_message, updated_at
  )
  select 'public_hourly', date_trunc('hour', batch.occurred_at), now(), now(), max(batch.occurred_at), 'complete', null, now()
  from pg_temp.v2_rollup_batch batch
  group by date_trunc('hour', batch.occurred_at)
  on conflict (rollup_name, bucket_start) do update set
    last_started_at = excluded.last_started_at,
    last_completed_at = excluded.last_completed_at,
    source_watermark = excluded.source_watermark,
    status = excluded.status,
    error_message = null,
    updated_at = now();

  update public.v2_analytics_outbox outbox
  set status = 'complete', last_error = null, updated_at = now()
  where outbox.status = 'processing' and (
    outbox.request_event_id in (select batch.request_event_id from pg_temp.v2_rollup_batch batch)
    or outbox.request_event_id in (select covered.request_event_id from pg_temp.v2_rollup_covered covered)
  );


  delete from private.v2_analytics_previous_grains
  where grain_id in (select grain_id from pg_temp.v2_previous_grain_batch);
  return jsonb_build_object(
    'selected', v_selected,
    'coalesced', v_coalesced,
    'private_grains', v_private_grains,
    'public_daily_grains', v_public_daily_grains,
    'public_hourly_grains', v_public_hourly_grains
  );
end;
$function$;

COMMENT ON FUNCTION "public"."process_v2_analytics_outbox"(integer) IS 'Serializes summary rebuilds, claims a bounded seed batch, and coalesces covered workspace/hour events before idempotent private daily, public daily, and public hourly rebuilds. At most 2000 acknowledgments per run; corrections retain row locks and re-enqueue after commit.';

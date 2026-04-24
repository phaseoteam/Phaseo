create or replace function public.get_monitor_model_rows(
  p_include_hidden boolean default false
)
returns table (
  model_id text,
  model_name text,
  model_release_date date,
  model_retirement_date date,
  model_status text,
  model_input_types text,
  model_output_types text,
  organisation_id text,
  organisation_name text,
  hidden boolean,
  provider_api_model_id text,
  provider_id text,
  api_model_id text,
  provider_model_slug text,
  is_active_gateway boolean,
  input_modalities text[],
  output_modalities text[],
  quantization_scheme text,
  context_length integer,
  provider_max_output_tokens integer,
  effective_from timestamptz,
  effective_to timestamptz,
  capability_id text,
  capability_params jsonb,
  capability_status text,
  capability_max_input_tokens integer,
  capability_max_output_tokens integer,
  api_provider_name text,
  provider_link text,
  input_price numeric,
  output_price numeric,
  standard_input_price numeric,
  standard_output_price numeric,
  standard_input_price_label text,
  standard_input_price_unit text,
  standard_output_price_label text,
  standard_output_price_unit text,
  from_price numeric,
  from_price_unit text,
  pricing_tier text,
  is_free_variant boolean,
  weekly_tokens_model bigint,
  weekly_tokens_model_provider bigint,
  weekly_throughput_model numeric,
  weekly_latency_model numeric
)
language sql
stable
as $$
  with normalized_weekly_requests as (
    select
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.model_id, '')
      ) as canonical_model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      public.gateway_usage_total_tokens(gr.usage)::bigint as total_tokens,
      gr.throughput::numeric as throughput,
      gr.latency_ms::numeric as latency_ms
    from public.gateway_requests gr
    where gr.created_at >= now() - interval '7 days'
      and gr.success is true
  ),
  weekly_model_usage as (
    select
      r.canonical_model_id as model_id,
      sum(r.total_tokens)::bigint as weekly_tokens_model,
      round(avg(r.throughput), 2) as weekly_throughput_model,
      round(avg(r.latency_ms), 0) as weekly_latency_model
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
    from public.data_api_pricing_rules pr
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
    from public.data_api_provider_models pm
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
  join public.data_api_provider_model_capabilities cap
    on cap.provider_api_model_id = pm.provider_api_model_id
  left join public.data_models dm
    on dm.model_id = pm.canonical_model_id
  left join public.data_organisations org
    on org.organisation_id = dm.organisation_id
  left join public.data_api_providers provider
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
$$;

comment on function public.get_monitor_model_rows(boolean) is
  'Returns provider-capability monitor rows with joined model/provider/pricing metadata and 7d raw gateway usage metrics.';

create or replace function public.get_usage_tokens_weekly_model_provider(
  p_since timestamptz default now() - interval '8 weeks'
)
returns table (
  week_bucket timestamptz,
  model_id text,
  provider text,
  requests bigint,
  total_tokens bigint,
  total_cost_usd numeric,
  success_rate numeric
)
language sql
stable
as $$
  with normalized_requests as (
    select
      date_trunc('week', gr.created_at) as week_bucket,
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.model_id, '')
      ) as canonical_model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      gr.success,
      public.gateway_usage_total_tokens(gr.usage)::bigint as total_tokens,
      coalesce(gr.cost_nanos, 0)::bigint as total_cost_nanos
    from public.gateway_requests gr
    where gr.created_at >= p_since
  ),
  grouped as (
    select
      nr.week_bucket,
      nr.canonical_model_id as model_id,
      nr.provider_id as provider,
      count(*)::bigint as requests,
      sum(nr.total_tokens)::bigint as total_tokens,
      sum(nr.total_cost_nanos)::bigint as total_cost_nanos,
      count(*) filter (where nr.success is true)::bigint as success_requests
    from normalized_requests nr
    where nr.canonical_model_id is not null
      and nr.provider_id <> 'unknown'
    group by nr.week_bucket, nr.canonical_model_id, nr.provider_id
  )
  select
    g.week_bucket,
    g.model_id,
    g.provider,
    g.requests,
    g.total_tokens,
    round(g.total_cost_nanos / 1000000000.0, 4) as total_cost_usd,
    round(
      case
        when g.requests > 0 then g.success_requests::numeric / g.requests::numeric
        else null
      end,
      4
    ) as success_rate
  from grouped g
  order by g.week_bucket desc, g.total_tokens desc;
$$;

comment on function public.get_usage_tokens_weekly_model_provider(timestamptz) is
  'Aggregates weekly model/provider usage directly from gateway_requests without relying on removed rollup tables.';

grant execute on function public.get_monitor_model_rows(boolean) to authenticated, service_role;
grant execute on function public.get_usage_tokens_weekly_model_provider(timestamptz) to authenticated, service_role;

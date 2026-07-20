create or replace function public.get_public_catalog_pricing_summaries()
returns table (
  api_model_id text,
  lowest_input_price numeric,
  lowest_output_price numeric,
  lowest_standard_input_price numeric,
  lowest_standard_output_price numeric,
  lowest_standard_input_price_label text,
  lowest_standard_input_price_unit text,
  lowest_standard_output_price_label text,
  lowest_standard_output_price_unit text,
  lowest_from_price numeric,
  lowest_from_price_unit text,
  pricing_detail_rows jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with unexpired as (
    select
      regexp_replace(rule.model_key, '^[^:]+:(.*):[^:]+$', '\1') as api_model_id,
      lower(coalesce(rule.meter, '')) as meter,
      lower(coalesce(rule.unit, '')) as unit,
      rule.note,
      rule.unit_size::numeric as unit_size,
      rule.price_per_unit::numeric as price_per_unit,
      coalesce(rule.effective_from <= now(), true) as is_active
    from public.data_api_pricing_rules rule
    where lower(coalesce(rule.pricing_plan, 'standard')) = 'standard'
      and (rule.effective_to is null or rule.effective_to > now())
      and rule.model_key ~ '^[^:]+:.+:[^:]+$'
  ),
  eligible as (
    select
      unexpired.*,
      bool_or(is_active) over (partition by api_model_id) as has_active
    from unexpired
  ),
  normalized as (
    select
      eligible.*,
      case
        when note ~* '\$[0-9.]+\s*/\s*minute' then (substring(note from '\$([0-9.]+)\s*/\s*minute'))::numeric
        when price_per_unit is null or unit_size is null or unit_size <= 0 then null
        when meter like '%token%' or unit in ('token', 'tokens') then price_per_unit * (1000000::numeric / unit_size)
        when unit in ('minute', 'minutes', 'min', 'mins', 'm') then price_per_unit / unit_size / 60
        when unit in ('hour', 'hours', 'hr', 'hrs', 'h') then price_per_unit / unit_size / 3600
        else price_per_unit / unit_size
      end as display_price,
      case
        when note ~* '\$[0-9.]+\s*/\s*minute' then 'minute'
        when meter like '%token%' or unit in ('token', 'tokens') then '1M tokens'
        when unit in ('minute', 'minutes', 'min', 'mins', 'm', 'hour', 'hours', 'hr', 'hrs', 'h', 'second', 'seconds', 'sec', 'secs', 's') then 'second'
        when unit in ('image', 'images') then 'image'
        when unit in ('video', 'videos') then 'video'
        when unit in ('character', 'characters', 'char', 'chars') then 'character'
        else nullif(unit, '')
      end as display_unit,
      case
        when meter in ('input_text_tokens', 'input_tokens') then 'Text Input'
        when meter in ('input_audio_tokens', 'input_audio') then 'Audio Input'
        when meter in ('input_image_tokens', 'input_image') then 'Image Input'
        when meter in ('input_video_tokens', 'input_video') then 'Video Input'
        when meter in ('output_text_tokens', 'output_tokens') then 'Text Output'
        when meter in ('output_audio_tokens', 'output_audio', 'output_audio_seconds') then 'Audio Output'
        when meter in ('output_image_tokens', 'output_image') then 'Image Output'
        when meter in ('output_video_tokens', 'output_video', 'output_video_seconds') then 'Video Output'
        else null
      end as display_label,
      case
        when meter in ('input_text_tokens', 'input_tokens', 'input_audio_tokens', 'input_audio', 'input_image_tokens', 'input_image', 'input_video_tokens', 'input_video') then 'input'
        when meter in ('output_text_tokens', 'output_tokens', 'output_audio_tokens', 'output_audio', 'output_audio_seconds', 'output_image_tokens', 'output_image', 'output_video_tokens', 'output_video', 'output_video_seconds') then 'output'
        else null
      end as side
    from eligible
    where is_active or not has_active
  ),
  grouped as (
    select
      api_model_id,
      min(display_price) filter (where side = 'input') as input_price,
      min(display_price) filter (where side = 'output') as output_price,
      (array_agg(display_label order by display_price) filter (where side = 'input' and display_price is not null and display_label is not null))[1] as input_label,
      (array_agg(display_unit order by display_price) filter (where side = 'input' and display_price is not null and display_unit is not null))[1] as input_unit,
      (array_agg(display_label order by display_price) filter (where side = 'output' and display_price is not null and display_label is not null))[1] as output_label,
      (array_agg(display_unit order by display_price) filter (where side = 'output' and display_price is not null and display_unit is not null))[1] as output_unit,
      min(display_price) as from_price,
      case when count(distinct display_unit) filter (where display_price is not null and display_unit is not null) = 1
        then min(display_unit) filter (where display_price is not null and display_unit is not null)
        else null
      end as from_unit
    from normalized
    where display_price is not null and display_unit is not null
    group by api_model_id
  )
  select
    grouped.api_model_id,
    grouped.input_price,
    grouped.output_price,
    grouped.input_price,
    grouped.output_price,
    grouped.input_label,
    grouped.input_unit,
    grouped.output_label,
    grouped.output_unit,
    case when grouped.from_unit is not null then grouped.from_price else null end,
    grouped.from_unit,
    coalesce(details.rows, '[]'::jsonb)
  from grouped
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'label', detail.display_label,
        'value',
          case
            when detail.display_price = 0 then '$0'
            when detail.display_price < 0.001 then '$' || to_char(detail.display_price, 'FM999999999990.0000')
            when detail.display_price < 0.1 then '$' || to_char(detail.display_price, 'FM999999999990.000')
            when detail.display_price < 1 then '$' || to_char(detail.display_price, 'FM999999999990.00')
            else '$' || trim(trailing '.' from trim(trailing '0' from to_char(detail.display_price, 'FM999999999990.00')))
          end || ' / ' || detail.display_unit
      ) order by detail.display_price, detail.display_label
    ) as rows
    from (
      select distinct display_label, display_price, display_unit
      from normalized
      where normalized.api_model_id = grouped.api_model_id
        and side is not null
        and display_label is not null
        and display_price is not null
        and display_unit is not null
      order by display_price, display_label
      limit 6
    ) detail
  ) details on true;
$$;

comment on function public.get_public_catalog_pricing_summaries() is
  'Normalizes active (or next upcoming) standard pricing rules into one display summary per API model for public catalogue cards.';

grant execute on function public.get_public_catalog_pricing_summaries() to authenticated, service_role;

create or replace function public.get_public_models_page_rows()
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with pricing_rows as materialized (
    select * from public.get_public_catalog_pricing_summaries()
  ),
  gateway_rows as (
    select row.*
    from public.get_public_model_catalogue_rows(false) row
  ),
  enriched_gateway_rows as (
    select
      row.model_id,
      to_jsonb(row)
        || jsonb_build_object(
          'name', case
            when lower(row.model_id) like '%:free'
              and coalesce(base.name, row.name, row.model_id) !~* '\mfree\M'
              then coalesce(base.name, row.name, row.model_id) || ' (Free)'
            else coalesce(base.name, row.name, row.model_id)
          end,
          'organisation_id', coalesce(base.organisation_id, row.organisation_id, split_part(row.model_id, '/', 1)),
          'organisation_name', coalesce(org.name, row.organisation_name),
          'organisation_colour', coalesce(org.colour, row.organisation_colour),
          'primary_date', coalesce(base.release_date, base.announcement_date, row.primary_date),
          'primary_timestamp', extract(epoch from coalesce(base.release_date, base.announcement_date, row.primary_date)::timestamptz) * 1000,
          'primary_group_key', to_char(coalesce(base.release_date, base.announcement_date, row.primary_date), 'YYYY-MM'),
          'gateway_tiers', case
            when coalesce(row.gateway_features, array[]::text[]) @> array['free']::text[] then array['free', 'standard']::text[]
            else array['standard']::text[]
          end,
          'gateway_execution_regions', coalesce(region_data.regions, array[]::text[]),
          'lowest_input_price', coalesce(row.lowest_input_price, pricing.lowest_input_price),
          'lowest_output_price', coalesce(row.lowest_output_price, pricing.lowest_output_price),
          'lowest_standard_input_price', coalesce(row.lowest_standard_input_price, pricing.lowest_standard_input_price),
          'lowest_standard_output_price', coalesce(row.lowest_standard_output_price, pricing.lowest_standard_output_price),
          'lowest_standard_input_price_label', coalesce(row.lowest_standard_input_price_label, pricing.lowest_standard_input_price_label),
          'lowest_standard_input_price_unit', coalesce(row.lowest_standard_input_price_unit, pricing.lowest_standard_input_price_unit),
          'lowest_standard_output_price_label', coalesce(row.lowest_standard_output_price_label, pricing.lowest_standard_output_price_label),
          'lowest_standard_output_price_unit', coalesce(row.lowest_standard_output_price_unit, pricing.lowest_standard_output_price_unit),
          'lowest_from_price', coalesce(row.lowest_from_price, pricing.lowest_from_price),
          'lowest_from_price_unit', coalesce(row.lowest_from_price_unit, pricing.lowest_from_price_unit),
          'pricing_detail_rows', case when jsonb_array_length(coalesce(row.pricing_detail_rows, '[]'::jsonb)) > 0 then row.pricing_detail_rows else coalesce(pricing.pricing_detail_rows, '[]'::jsonb) end
        ) as payload
    from gateway_rows row
    left join lateral (
      select model.*
      from public.data_models model
      where model.hidden = false
        and (
          model.model_id = row.model_id
          or model.model_id = any(coalesce(row.gateway_api_model_ids, array[]::text[]))
          or model.model_id = regexp_replace(row.model_id, ':free$', '', 'i')
        )
      order by (model.model_id = row.model_id) desc, model.updated_at desc nulls last
      limit 1
    ) base on true
    left join public.data_organisations org on org.organisation_id = coalesce(base.organisation_id, row.organisation_id)
    left join lateral (
      select array_agg(distinct lower(region) order by lower(region)) as regions
      from jsonb_array_elements(coalesce(row.gateway_provider_details, '[]'::jsonb)) detail
      join public.data_api_providers provider
        on provider.api_provider_id = detail->>'id'
      cross join lateral unnest(coalesce(provider.default_execution_regions, array[]::text[])) region
      where coalesce((detail->>'is_active')::boolean, false)
        and btrim(region) <> ''
    ) region_data on true
    left join lateral (
      select
        min(price.lowest_input_price) as lowest_input_price,
        min(price.lowest_output_price) as lowest_output_price,
        min(price.lowest_standard_input_price) as lowest_standard_input_price,
        min(price.lowest_standard_output_price) as lowest_standard_output_price,
        (array_agg(price.lowest_standard_input_price_label order by price.lowest_standard_input_price) filter (where price.lowest_standard_input_price is not null))[1] as lowest_standard_input_price_label,
        (array_agg(price.lowest_standard_input_price_unit order by price.lowest_standard_input_price) filter (where price.lowest_standard_input_price is not null))[1] as lowest_standard_input_price_unit,
        (array_agg(price.lowest_standard_output_price_label order by price.lowest_standard_output_price) filter (where price.lowest_standard_output_price is not null))[1] as lowest_standard_output_price_label,
        (array_agg(price.lowest_standard_output_price_unit order by price.lowest_standard_output_price) filter (where price.lowest_standard_output_price is not null))[1] as lowest_standard_output_price_unit,
        min(price.lowest_from_price) as lowest_from_price,
        case when count(distinct price.lowest_from_price_unit) filter (where price.lowest_from_price is not null) = 1 then min(price.lowest_from_price_unit) filter (where price.lowest_from_price is not null) else null end as lowest_from_price_unit,
        coalesce((array_agg(price.pricing_detail_rows order by price.lowest_from_price nulls last) filter (where jsonb_array_length(price.pricing_detail_rows) > 0))[1], '[]'::jsonb) as pricing_detail_rows
      from pricing_rows price
      where price.api_model_id = row.model_id
        or price.api_model_id = any(coalesce(row.gateway_api_model_ids, array[]::text[]))
    ) pricing on true
  ),
  catalogue_only_rows as (
    select
      model.model_id,
      jsonb_build_object(
        'model_id', model.model_id,
        'name', coalesce(nullif(model.name, ''), model.model_id),
        'organisation_id', model.organisation_id,
        'organisation_name', org.name,
        'organisation_colour', org.colour,
        'primary_date', coalesce(model.release_date, model.announcement_date),
        'primary_timestamp', extract(epoch from coalesce(model.release_date, model.announcement_date)::timestamptz) * 1000,
        'primary_group_key', to_char(coalesce(model.release_date, model.announcement_date), 'YYYY-MM'),
        'gateway_status', case when lower(coalesce(model.status, '')) = 'announced' then 'coming_soon' else 'not_listed' end,
        'gateway_provider_count', 0,
        'gateway_active_provider_count', 0,
        'gateway_endpoints', array[]::text[],
        'gateway_input_modalities', coalesce(model.input_types, array[]::text[]),
        'gateway_output_modalities', coalesce(model.output_types, array[]::text[]),
        'gateway_features', array[]::text[],
        'gateway_tiers', array[]::text[],
        'gateway_provider_names', array[]::text[],
        'gateway_active_provider_names', array[]::text[],
        'gateway_execution_regions', array[]::text[],
        'gateway_provider_details', '[]'::jsonb,
        'gateway_api_model_ids', array[]::text[],
        'context_lengths', array[]::integer[],
        'supported_parameters', array[]::text[],
        'lowest_input_price', pricing.lowest_input_price,
        'lowest_output_price', pricing.lowest_output_price,
        'lowest_standard_input_price', pricing.lowest_standard_input_price,
        'lowest_standard_output_price', pricing.lowest_standard_output_price,
        'lowest_standard_input_price_label', pricing.lowest_standard_input_price_label,
        'lowest_standard_input_price_unit', pricing.lowest_standard_input_price_unit,
        'lowest_standard_output_price_label', pricing.lowest_standard_output_price_label,
        'lowest_standard_output_price_unit', pricing.lowest_standard_output_price_unit,
        'lowest_from_price', pricing.lowest_from_price,
        'lowest_from_price_unit', pricing.lowest_from_price_unit,
        'pricing_detail_rows', coalesce(pricing.pricing_detail_rows, '[]'::jsonb),
        'popularity_tokens_week', null,
        'throughput_week', null,
        'latency_week', null
      ) as payload
    from public.data_models model
    left join public.data_organisations org on org.organisation_id = model.organisation_id
    left join pricing_rows pricing on pricing.api_model_id = model.model_id
    where model.hidden = false
      and not exists (
        select 1
        from gateway_rows row
        where row.model_id = model.model_id
          or model.model_id = any(coalesce(row.gateway_api_model_ids, array[]::text[]))
          or regexp_replace(row.model_id, ':free$', '', 'i') = model.model_id
      )
  )
  select payload
  from (
    select model_id, payload from enriched_gateway_rows
    union all
    select model_id, payload from catalogue_only_rows
  ) page_rows
  order by
    nullif(payload->>'primary_timestamp', '')::numeric desc nulls last,
    payload->>'organisation_name' asc nulls last,
    payload->>'name' asc;
$$;

comment on function public.get_public_models_page_rows() is
  'Returns the complete compact /models page projection, including catalogue-only models and provider execution regions, so the Worker does not repeat database joins.';

grant execute on function public.get_public_models_page_rows() to authenticated, service_role;

create or replace function public.get_usage_model_apps(
  p_model_ids text[],
  p_limit integer default 24,
  p_since timestamptz default null
)
returns table (
  app_id uuid,
  title text,
  image_url text,
  url text,
  last_seen timestamptz,
  requests bigint,
  success_requests bigint,
  total_tokens numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    app.id,
    app.title,
    app.image_url,
    app.url,
    max(coalesce(app.last_seen, request.created_at)) as last_seen,
    count(*)::bigint as requests,
    count(*) filter (where request.success)::bigint as success_requests,
    coalesce(sum(
      case
        when jsonb_typeof(request.usage) = 'object' and request.usage->>'total_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$'
          then (request.usage->>'total_tokens')::numeric
        else 0
      end
    ), 0)::numeric as total_tokens
  from public.gateway_requests request
  join public.api_apps app on app.id = request.app_id and app.is_public = true
  where request.app_id is not null
    and request.created_at >= coalesce(p_since, now() - interval '30 days')
    and (
      request.model_id = any(coalesce(p_model_ids, array[]::text[]))
      or request.requested_model_id = any(coalesce(p_model_ids, array[]::text[]))
      or request.routed_model_id = any(coalesce(p_model_ids, array[]::text[]))
    )
  group by app.id, app.title, app.image_url, app.url
  order by total_tokens desc, requests desc, app.id
  limit greatest(1, least(coalesce(p_limit, 24), 100));
$$;

comment on function public.get_usage_model_apps(text[], integer, timestamptz) is
  'Aggregates public app usage directly in PostgreSQL for model aliases after legacy usage rollup tables were removed.';

grant execute on function public.get_usage_model_apps(text[], integer, timestamptz) to authenticated, service_role;

create index if not exists idx_gateway_requests_free_router_recent
  on public.gateway_requests (created_at desc, routed_model_id)
  include (cost_nanos)
  where requested_model_id = 'phaseo/free';

create or replace function public.get_public_free_router_overview()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with active_free_rules as (
    select distinct
      split_part(rule.model_key, ':', 1) as provider_id,
      regexp_replace(regexp_replace(rule.model_key, '^[^:]+:', ''), ':[^:]+$', '') as api_model_id
    from public.data_api_pricing_rules rule
    where rule.model_key ilike '%:free:%'
      and now() >= coalesce(rule.effective_from, '-infinity'::timestamptz)
      and now() < coalesce(rule.effective_to, 'infinity'::timestamptz)
  ),
  eligible as (
    select
      coalesce(nullif(provider_model.model_id, ''), provider_model.api_model_id) as model_id,
      provider_model.api_model_id,
      provider_model.provider_id,
      provider_model.input_modalities,
      provider_model.output_modalities
    from public.data_api_provider_models provider_model
    join active_free_rules rule
      on rule.provider_id = provider_model.provider_id
      and rule.api_model_id = provider_model.api_model_id
    where provider_model.is_active_gateway = true
      and now() >= coalesce(provider_model.effective_from, '-infinity'::timestamptz)
      and now() < coalesce(provider_model.effective_to, 'infinity'::timestamptz)
  ),
  eligible_models as (
    select
      eligible.model_id,
      case when count(distinct eligible.api_model_id) = 1 then min(eligible.api_model_id) else eligible.model_id end as display_api_model_id,
      count(distinct eligible.provider_id)::bigint as provider_count,
      coalesce((select array_agg(distinct value order by value) from eligible input_row cross join lateral unnest(coalesce(input_row.input_modalities, array[]::text[])) value where input_row.model_id = eligible.model_id and btrim(value) <> ''), array[]::text[]) as input_modalities,
      coalesce((select array_agg(distinct value order by value) from eligible output_row cross join lateral unnest(coalesce(output_row.output_modalities, array[]::text[])) value where output_row.model_id = eligible.model_id and btrim(value) <> ''), array[]::text[]) as output_modalities
    from eligible
    group by eligible.model_id
  ),
  usage as (
    select
      request.routed_model_id as model_id,
      count(*)::bigint as requests_30d,
      coalesce(sum(greatest(coalesce(request.cost_nanos, 0), 0)), 0)::numeric as total_cost_nanos_30d,
      max(request.created_at) as last_routed_at
    from public.gateway_requests request
    join eligible_models eligible on eligible.model_id = request.routed_model_id
    where request.requested_model_id = 'phaseo/free'
      and request.created_at >= now() - interval '30 days'
    group by request.routed_model_id
  ),
  model_rows as (
    select
      eligible.model_id,
      eligible.provider_count,
      coalesce(usage.requests_30d, 0)::bigint as requests_30d,
      coalesce(usage.total_cost_nanos_30d, 0)::numeric as total_cost_nanos_30d,
      jsonb_build_object(
        'modelId', eligible.model_id,
        'displayApiModelId', eligible.display_api_model_id,
        'name', coalesce(nullif(model.name, ''), eligible.model_id),
        'organisationId', coalesce(model.organisation_id, ''),
        'organisationName', coalesce(nullif(organisation.name, ''), model.organisation_id, 'Unknown'),
        'providerCount', eligible.provider_count,
        'inputModalities', case when cardinality(eligible.input_modalities) > 0 then eligible.input_modalities else coalesce(model.input_types, array[]::text[]) end,
        'outputModalities', case when cardinality(eligible.output_modalities) > 0 then eligible.output_modalities else coalesce(model.output_types, array[]::text[]) end,
        'usage', jsonb_build_object(
          'requests30d', coalesce(usage.requests_30d, 0),
          'totalCostNanos30d', coalesce(usage.total_cost_nanos_30d, 0),
          'lastRoutedAt', usage.last_routed_at
        )
      ) as payload
    from eligible_models eligible
    join public.data_models model on model.model_id = eligible.model_id and model.hidden = false
    left join public.data_organisations organisation on organisation.organisation_id = model.organisation_id
    left join usage on usage.model_id = eligible.model_id
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'eligibleModels', count(*),
      'eligibleProviders', (select count(distinct provider_id) from eligible),
      'routedRequests30d', coalesce(sum(requests_30d), 0),
      'totalCostNanos30d', coalesce(sum(total_cost_nanos_30d), 0)
    ),
    'models', coalesce(jsonb_agg(payload order by requests_30d desc, model_id), '[]'::jsonb)
  )
  from model_rows;
$$;

comment on function public.get_public_free_router_overview() is
  'Builds the free-router eligibility, modality, and 30-day usage summary in PostgreSQL so /models does not scan gateway requests in the Worker.';

grant execute on function public.get_public_free_router_overview() to authenticated, service_role;

create or replace function public.get_public_compare_realtime(
  p_model_ids text[],
  p_window_minutes integer default 30
)
returns table (
  model_id text,
  realtime_requests bigint,
  realtime_latency_p50 numeric,
  realtime_throughput_p50 numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with selected as (
    select model.model_id
    from public.data_models model
    where model.hidden = false
      and model.model_id = any(coalesce(p_model_ids, array[]::text[]))
  ),
  aliases as (
    select selected.model_id, selected.model_id as alias_id from selected
    union
    select selected.model_id, provider_model.model_id
    from selected
    join public.data_api_provider_models provider_model
      on provider_model.model_id = selected.model_id or provider_model.api_model_id = selected.model_id
    where provider_model.model_id is not null and btrim(provider_model.model_id) <> ''
    union
    select selected.model_id, provider_model.api_model_id
    from selected
    join public.data_api_provider_models provider_model
      on provider_model.model_id = selected.model_id or provider_model.api_model_id = selected.model_id
    where provider_model.api_model_id is not null and btrim(provider_model.api_model_id) <> ''
  ),
  realtime_samples as (
    select
      alias.model_id,
      request.latency_ms::numeric as latency_ms,
      case
        when request.throughput > 0 then request.throughput::numeric
        when request.generation_ms > 0 then
          coalesce(
            case when request.usage->>'output_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$' then (request.usage->>'output_tokens')::numeric end,
            case when request.usage->>'completion_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$' then (request.usage->>'completion_tokens')::numeric end,
            case when request.usage->>'generated_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$' then (request.usage->>'generated_tokens')::numeric end,
            case when request.usage->>'response_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$' then (request.usage->>'response_tokens')::numeric end,
            case when request.usage->>'total_tokens' ~ '^[0-9]+(?:\.[0-9]+)?$' then (request.usage->>'total_tokens')::numeric end
          ) * 1000 / request.generation_ms
        else null
      end as throughput
    from aliases alias
    join public.gateway_requests request on request.model_id = alias.alias_id
    where request.created_at >= now() - make_interval(mins => greatest(1, least(coalesce(p_window_minutes, 30), 1440)))
      and request.created_at <= now()
  ),
  realtime as (
    select
      sample.model_id,
      count(*)::bigint as requests,
      percentile_cont(0.5) within group (order by sample.latency_ms) filter (where sample.latency_ms > 0)::numeric as latency_p50,
      percentile_cont(0.5) within group (order by sample.throughput) filter (where sample.throughput > 0)::numeric as throughput_p50
    from realtime_samples sample
    group by sample.model_id
  )
  select
    selected.model_id,
    coalesce(realtime.requests, 0),
    realtime.latency_p50,
    realtime.throughput_p50
  from selected
  left join realtime on realtime.model_id = selected.model_id
  order by array_position(p_model_ids, selected.model_id);
$$;

comment on function public.get_public_compare_realtime(text[], integer) is
  'Returns batched realtime request medians for a visible comparison selection without sending raw gateway requests to the Worker.';

grant execute on function public.get_public_compare_realtime(text[], integer) to authenticated, service_role;

create or replace function public.get_public_country_summaries()
returns table (
  iso text,
  total_organisations bigint,
  total_models bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    upper(btrim(organisation.country_code)) as iso,
    count(distinct organisation.organisation_id)::bigint as total_organisations,
    count(model.model_id)::bigint as total_models
  from public.data_organisations organisation
  left join public.data_models model
    on model.organisation_id = organisation.organisation_id
    and model.hidden = false
  where organisation.country_code is not null
    and btrim(organisation.country_code) <> ''
  group by upper(btrim(organisation.country_code))
  order by total_models desc, iso;
$$;

comment on function public.get_public_country_summaries() is
  'Returns compact public country counts for the country index without materializing nested model catalogues.';

grant execute on function public.get_public_country_summaries() to authenticated, service_role;

create or replace function public.get_public_search_index()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with visible_models as (
    select
      model.model_id,
      model.name,
      model.organisation_id,
      organisation.name as organisation_name,
      coalesce(model.release_date, model.announcement_date) as primary_date
    from public.data_models model
    left join public.data_organisations organisation
      on organisation.organisation_id = model.organisation_id
    where model.hidden = false
  ),
  active_provider_counts as (
    select
      provider_model.provider_id,
      count(distinct coalesce(
        nullif(btrim(provider_model.api_model_id), ''),
        nullif(btrim(provider_model.provider_api_model_id), ''),
        nullif(btrim(provider_model.model_id), '')
      )) filter (
        where provider_model.is_active_gateway = true
          and (provider_model.effective_from is null or provider_model.effective_from <= now())
          and (provider_model.effective_to is null or provider_model.effective_to > now())
      )::bigint as active_models
    from public.data_api_provider_models provider_model
    group by provider_model.provider_id
  )
  select jsonb_build_object(
    'm', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          model.model_id,
          model.name,
          model.organisation_name,
          '/models/' || model.model_id,
          model.organisation_id,
          case
            when model.primary_date is null then null
            else to_char(model.primary_date, 'FMMonth YYYY')
          end
        )
        order by model.primary_date desc nulls last, model.name, model.model_id
      )
      from visible_models model
    ), '[]'::jsonb),
    'o', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          organisation.organisation_id,
          coalesce(nullif(organisation.name, ''), organisation.organisation_id),
          null,
          '/organisations/' || organisation.organisation_id,
          organisation.organisation_id
        )
        order by coalesce(nullif(organisation.name, ''), organisation.organisation_id), organisation.organisation_id
      )
      from public.data_organisations organisation
    ), '[]'::jsonb),
    'b', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          benchmark.id,
          benchmark.name,
          coalesce(benchmark.total_models, 0)::text || ' models',
          '/benchmarks/' || benchmark.id
        )
        order by benchmark.name, benchmark.id
      )
      from public.data_benchmarks benchmark
    ), '[]'::jsonb),
    'p', coalesce((
      select jsonb_agg(
        jsonb_build_array(
          provider.api_provider_id,
          provider.api_provider_name,
          coalesce(provider_counts.active_models, 0)::text || ' active models',
          '/api-providers/' || provider.api_provider_id,
          provider.api_provider_id
        )
        order by provider.api_provider_name, provider.api_provider_id
      )
      from public.data_api_providers provider
      left join active_provider_counts provider_counts
        on provider_counts.provider_id = provider.api_provider_id
    ), '[]'::jsonb),
    's', '[]'::jsonb,
    'c', '[]'::jsonb,
    'v', coalesce((
      select generation
      from public.web_cache_generations
      where scope = 'search'
    ), 1)
  );
$$;

comment on function public.get_public_search_index() is
  'Returns the complete compact global-search payload as one JSON value so PostgREST row limits cannot truncate the index.';

revoke all on function public.get_public_search_index() from public, anon;
grant execute on function public.get_public_search_index() to authenticated, service_role;

notify pgrst, 'reload schema';

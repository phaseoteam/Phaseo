create or replace function public.get_public_model_catalogue_rows(
  p_include_hidden boolean default false
)
returns table (
  model_id text,
  name text,
  organisation_id text,
  organisation_name text,
  organisation_colour text,
  primary_date date,
  primary_timestamp numeric,
  primary_group_key text,
  gateway_status text,
  gateway_provider_count integer,
  gateway_active_provider_count integer,
  gateway_endpoints text[],
  gateway_input_modalities text[],
  gateway_output_modalities text[],
  gateway_features text[],
  gateway_provider_names text[],
  gateway_active_provider_names text[],
  gateway_provider_details jsonb,
  gateway_api_model_ids text[],
  context_lengths integer[],
  supported_parameters text[],
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
  pricing_detail_rows jsonb,
  popularity_tokens_week numeric,
  throughput_week numeric,
  latency_week numeric
)
language sql
stable
as $$
  with source_rows as (
    select
      r.*,
      case
        when lower(coalesce(r.capability_status, '')) = 'disabled' then 'disabled'
        when lower(coalesce(r.capability_status, '')) in ('deranked', 'de_ranked', 'deranked_lvl1', 'deranked_lvl_1') then 'deranked_lvl1'
        when lower(coalesce(r.capability_status, '')) in ('deranked_lvl2', 'deranked_lvl_2') then 'deranked_lvl2'
        when lower(coalesce(r.capability_status, '')) in ('deranked_lvl3', 'deranked_lvl_3') then 'deranked_lvl3'
        when lower(coalesce(r.capability_status, '')) in ('coming_soon', 'comingsoon') then 'coming_soon'
        when lower(coalesce(r.capability_status, '')) = 'inactive' then 'inactive'
        when coalesce(r.is_active_gateway, false) then 'active'
        else 'inactive'
      end as normalized_gateway_status
    from public.get_monitor_model_rows(p_include_hidden) r
    where r.model_id is not null
      and btrim(r.model_id) <> ''
  ),
  model_provider_status as (
    select
      sr.model_id,
      sr.provider_id,
      max(sr.api_provider_name) as api_provider_name,
      min(
        case sr.normalized_gateway_status
          when 'active' then 1
          when 'coming_soon' then 2
          when 'deranked_lvl1' then 3
          when 'deranked_lvl2' then 4
          when 'deranked_lvl3' then 5
          when 'inactive' then 6
          when 'disabled' then 7
          else 8
        end
      ) as status_rank
    from source_rows sr
    where sr.provider_id is not null
      and btrim(sr.provider_id) <> ''
    group by sr.model_id, sr.provider_id
  ),
  provider_details as (
    select
      mps.model_id,
      jsonb_agg(
        jsonb_build_object(
          'id', mps.provider_id,
          'name', coalesce(nullif(mps.api_provider_name, ''), mps.provider_id),
          'status',
            case mps.status_rank
              when 1 then 'active'
              when 2 then 'coming_soon'
              when 3 then 'deranked_lvl1'
              when 4 then 'deranked_lvl2'
              when 5 then 'deranked_lvl3'
              when 6 then 'inactive'
              when 7 then 'disabled'
              else 'inactive'
            end,
          'is_active', mps.status_rank in (1, 3, 4, 5)
        )
        order by mps.status_rank asc, coalesce(nullif(mps.api_provider_name, ''), mps.provider_id) asc
      ) as details
    from model_provider_status mps
    group by mps.model_id
  ),
  model_features as (
    select
      sr.model_id,
      array_remove(array[
        case when bool_or(coalesce(sr.is_free_variant, false)) then 'free' end,
        case when bool_or(coalesce(sr.capability_params::text, '') ilike '%reasoning%' or coalesce(sr.capability_params::text, '') ilike '%thinking%') then 'reasoning' end,
        case when bool_or(coalesce(sr.capability_params::text, '') ilike '%tool%' or coalesce(sr.capability_params::text, '') ilike '%function_call%') then 'tools' end,
        case when bool_or(coalesce(sr.capability_params::text, '') ilike '%structured_output%' or coalesce(sr.capability_params::text, '') ilike '%response_format%' or coalesce(sr.capability_params::text, '') ilike '%json_schema%') then 'structured_outputs' end,
        case when bool_or(coalesce(sr.capability_params::text, '') ilike '%web_search%' or coalesce(sr.capability_params::text, '') ilike '%websearch%' or coalesce(sr.capability_params::text, '') ilike '%native_web_search%') then 'web_search' end
      ], null) as features
    from source_rows sr
    group by sr.model_id
  ),
  model_supported_parameters as (
    select
      sr.model_id,
      coalesce(
        array_agg(distinct key order by key) filter (
          where key is not null
            and length(key) >= 2
            and key not in ('type', 'title', 'description', 'default', 'minimum', 'maximum', 'enum', 'oneof', 'anyof', 'allof', 'items', 'properties', 'required', 'nullable', 'additionalproperties', '$schema', '$id', 'strict')
        ),
        array[]::text[]
      ) as supported_parameters
    from source_rows sr
    left join lateral jsonb_object_keys(
      case
        when jsonb_typeof(sr.capability_params) = 'object' then sr.capability_params
        else '{}'::jsonb
      end
    ) as keys(key) on true
    group by sr.model_id
  ),
  grouped as (
    select
      sr.model_id,
      max(sr.model_name) as name,
      max(sr.organisation_id) as organisation_id,
      max(sr.organisation_name) as organisation_name,
      max(org.colour) as organisation_colour,
      max(sr.model_release_date) as primary_date,
      max(extract(epoch from sr.model_release_date::timestamptz) * 1000) as primary_timestamp,
      max(to_char(sr.model_release_date, 'YYYY-MM')) as primary_group_key,
      count(distinct sr.provider_id) filter (where sr.provider_id is not null and btrim(sr.provider_id) <> '')::integer as gateway_provider_count,
      count(distinct sr.provider_id) filter (
        where sr.provider_id is not null
          and btrim(sr.provider_id) <> ''
          and sr.normalized_gateway_status in ('active', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3')
      )::integer as gateway_active_provider_count,
      bool_or(sr.normalized_gateway_status = 'coming_soon') as has_coming_soon_provider,
      array_agg(distinct sr.capability_id order by sr.capability_id) filter (where sr.capability_id is not null and btrim(sr.capability_id) <> '') as gateway_endpoints,
      array_agg(distinct input_modality order by input_modality) filter (where input_modality is not null and btrim(input_modality) <> '') as gateway_input_modalities,
      array_agg(distinct output_modality order by output_modality) filter (where output_modality is not null and btrim(output_modality) <> '') as gateway_output_modalities,
      array_agg(distinct coalesce(nullif(sr.api_provider_name, ''), sr.provider_id) order by coalesce(nullif(sr.api_provider_name, ''), sr.provider_id)) filter (where sr.provider_id is not null and btrim(sr.provider_id) <> '') as gateway_provider_names,
      array_agg(distinct coalesce(nullif(sr.api_provider_name, ''), sr.provider_id) order by coalesce(nullif(sr.api_provider_name, ''), sr.provider_id)) filter (
        where sr.provider_id is not null
          and btrim(sr.provider_id) <> ''
          and sr.normalized_gateway_status in ('active', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3')
      ) as gateway_active_provider_names,
      array_agg(distinct sr.api_model_id order by sr.api_model_id) filter (where sr.api_model_id is not null and btrim(sr.api_model_id) <> '') as gateway_api_model_ids,
      array_agg(distinct coalesce(sr.context_length, sr.capability_max_input_tokens) order by coalesce(sr.context_length, sr.capability_max_input_tokens)) filter (where coalesce(sr.context_length, sr.capability_max_input_tokens) > 0) as context_lengths,
      min(sr.input_price) filter (where sr.normalized_gateway_status in ('active', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3') and sr.input_price > 0) as lowest_input_price,
      min(sr.output_price) filter (where sr.normalized_gateway_status in ('active', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3') and sr.output_price > 0) as lowest_output_price,
      min(sr.standard_input_price) filter (where sr.normalized_gateway_status in ('active', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3') and sr.standard_input_price > 0) as lowest_standard_input_price,
      min(sr.standard_output_price) filter (where sr.normalized_gateway_status in ('active', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3') and sr.standard_output_price > 0) as lowest_standard_output_price,
      min(sr.standard_input_price_label) filter (where sr.standard_input_price_label is not null) as lowest_standard_input_price_label,
      min(sr.standard_input_price_unit) filter (where sr.standard_input_price_unit is not null) as lowest_standard_input_price_unit,
      min(sr.standard_output_price_label) filter (where sr.standard_output_price_label is not null) as lowest_standard_output_price_label,
      min(sr.standard_output_price_unit) filter (where sr.standard_output_price_unit is not null) as lowest_standard_output_price_unit,
      min(sr.from_price) filter (where sr.normalized_gateway_status in ('active', 'deranked_lvl1', 'deranked_lvl2', 'deranked_lvl3') and sr.from_price >= 0) as lowest_from_price,
      case
        when count(distinct sr.from_price_unit) filter (where sr.from_price_unit is not null and btrim(sr.from_price_unit) <> '') = 1
          then min(sr.from_price_unit) filter (where sr.from_price_unit is not null and btrim(sr.from_price_unit) <> '')
        else null
      end as lowest_from_price_unit,
      max(sr.weekly_tokens_model)::numeric as popularity_tokens_week,
      max(sr.weekly_throughput_model)::numeric as throughput_week,
      max(sr.weekly_latency_model)::numeric as latency_week
    from source_rows sr
    left join public.data_organisations org
      on org.organisation_id = sr.organisation_id
    left join lateral unnest(coalesce(sr.input_modalities, array[]::text[])) as input_values(input_modality) on true
    left join lateral unnest(coalesce(sr.output_modalities, array[]::text[])) as output_values(output_modality) on true
    group by sr.model_id
  )
  select
    g.model_id,
    coalesce(nullif(g.name, ''), g.model_id) as name,
    coalesce(g.organisation_id, split_part(g.model_id, '/', 1)) as organisation_id,
    g.organisation_name,
    g.organisation_colour,
    g.primary_date,
    g.primary_timestamp,
    g.primary_group_key,
    case
      when g.gateway_active_provider_count > 0 then 'active'
      when g.has_coming_soon_provider then 'coming_soon'
      when g.gateway_provider_count > 0 then 'inactive'
      else 'not_listed'
    end as gateway_status,
    g.gateway_provider_count,
    g.gateway_active_provider_count,
    coalesce(g.gateway_endpoints, array[]::text[]) as gateway_endpoints,
    coalesce(g.gateway_input_modalities, array[]::text[]) as gateway_input_modalities,
    coalesce(g.gateway_output_modalities, array[]::text[]) as gateway_output_modalities,
    coalesce(mf.features, array[]::text[]) as gateway_features,
    coalesce(g.gateway_provider_names, array[]::text[]) as gateway_provider_names,
    coalesce(g.gateway_active_provider_names, array[]::text[]) as gateway_active_provider_names,
    coalesce(pd.details, '[]'::jsonb) as gateway_provider_details,
    coalesce(g.gateway_api_model_ids, array[]::text[]) as gateway_api_model_ids,
    coalesce(g.context_lengths, array[]::integer[]) as context_lengths,
    coalesce(msp.supported_parameters, array[]::text[]) as supported_parameters,
    g.lowest_input_price,
    g.lowest_output_price,
    g.lowest_standard_input_price,
    g.lowest_standard_output_price,
    g.lowest_standard_input_price_label,
    g.lowest_standard_input_price_unit,
    g.lowest_standard_output_price_label,
    g.lowest_standard_output_price_unit,
    g.lowest_from_price,
    g.lowest_from_price_unit,
    '[]'::jsonb as pricing_detail_rows,
    g.popularity_tokens_week,
    g.throughput_week,
    g.latency_week
  from grouped g
  left join provider_details pd on pd.model_id = g.model_id
  left join model_features mf on mf.model_id = g.model_id
  left join model_supported_parameters msp on msp.model_id = g.model_id
  order by g.primary_timestamp desc nulls last, g.organisation_name asc nulls last, g.name asc;
$$;

comment on function public.get_public_model_catalogue_rows(boolean) is
  'Returns one compact public catalogue row per model for /models, aggregating provider-capability rows in Postgres to reduce web origin payload/work.';

grant execute on function public.get_public_model_catalogue_rows(boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

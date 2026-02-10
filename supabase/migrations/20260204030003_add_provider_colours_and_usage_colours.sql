-- Add provider colours and expose org colours on usage timeseries

alter table if exists public.data_api_providers
  add column if not exists colour text;
drop function if exists public.get_public_usage_timeseries(text, text, integer);
create or replace function public.get_public_usage_timeseries(
  p_time_range text default 'week',
  p_bucket_size text default 'hour',
  p_top_n integer default 10
)
returns table (
  bucket timestamp with time zone,
  model_id text,
  requests bigint,
  tokens bigint,
  colour text
) as $$
#variable_conflict use_column
declare
  v_since timestamptz;
  v_rollup_count bigint;
begin
  case p_time_range
    when '24h' then v_since := now() - interval '24 hours';
    when 'week' then v_since := now() - interval '7 days';
    when 'month' then v_since := now() - interval '30 days';
    when 'year' then v_since := now() - interval '1 year';
    else v_since := now() - interval '7 days';
  end case;

  if p_bucket_size = 'week' then
    select count(*)
    into v_rollup_count
    from public.public_usage_weekly_models m
    where m.bucket >= date_trunc('week', v_since);

    if v_rollup_count > 0 then
      return query
      with base as (
        select m.bucket, m.model_id, m.requests, m.tokens
        from public.public_usage_weekly_models m
        where m.bucket >= date_trunc('week', v_since)
      ),
      top_models as (
        select base.model_id
        from base
        group by base.model_id
        order by sum(base.tokens) desc
        limit p_top_n
      ),
      bucketed as (
        select
          base.bucket as time_bucket,
          case
            when base.model_id in (select model_id from top_models) then base.model_id
            else 'Other'
          end as model_group,
          sum(base.requests) as req_count,
          sum(base.tokens) as tok_count
        from base
        group by time_bucket, model_group
      )
      select
        b.time_bucket as bucket,
        b.model_group as model_id,
        b.req_count::bigint as requests,
        b.tok_count::bigint as tokens,
        case
          when b.model_group = 'Other' then null
          else org.colour
        end as colour
      from bucketed b
      left join public.data_models dm on dm.model_id = b.model_group
      left join public.data_organisations org on dm.organisation_id = org.organisation_id
      order by b.time_bucket, b.tok_count desc;

      return;
    end if;
  end if;

  return query
  with bucketed_data as (
    select
      case
        when p_bucket_size = '5min' then
          date_trunc('minute', gr.created_at)
          - make_interval(mins => (extract(minute from gr.created_at)::int % 5))
        when p_bucket_size = 'hour' then date_trunc('hour', gr.created_at)
        when p_bucket_size = 'day' then date_trunc('day', gr.created_at)
        when p_bucket_size = 'week' then date_trunc('week', gr.created_at)
        when p_bucket_size = 'month' then date_trunc('month', gr.created_at)
        else date_trunc('hour', gr.created_at)
      end as time_bucket,
      coalesce(gr.model_id, 'Unknown') as model_group,
      count(*) as req_count,
      sum(coalesce((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
    from public.gateway_requests gr
    where gr.created_at >= v_since
    group by time_bucket, model_group
  )
  select
    bd.time_bucket as bucket,
    bd.model_group as model_id,
    bd.req_count::bigint as requests,
    bd.tok_count::bigint as tokens,
    case
      when bd.model_group = 'Other' then null
      else org.colour
    end as colour
  from bucketed_data bd
  left join public.data_models dm on dm.model_id = bd.model_group
  left join public.data_organisations org on dm.organisation_id = org.organisation_id
  order by bd.time_bucket, bd.tok_count desc;
end;
$$ language plpgsql stable;
create or replace function public.get_public_market_share_timeseries(
  p_dimension text default 'organization',
  p_time_range text default 'year',
  p_bucket_size text default 'week',
  p_top_n integer default 8
)
returns table (
  bucket timestamp with time zone,
  name text,
  requests bigint,
  tokens bigint,
  colour text
) as $$
#variable_conflict use_column
declare
  v_since timestamptz;
  v_rollup_count bigint;
begin
  case p_time_range
    when '24h' then v_since := now() - interval '24 hours';
    when 'week' then v_since := now() - interval '7 days';
    when 'month' then v_since := now() - interval '30 days';
    when 'year' then v_since := now() - interval '1 year';
    else v_since := now() - interval '1 year';
  end case;

  if p_bucket_size = 'week' then
    if p_dimension = 'organization' then
      select count(*)
      into v_rollup_count
      from public.public_usage_weekly_organisations o
      where o.bucket >= date_trunc('week', v_since);

      if v_rollup_count > 0 then
        return query
        with base as (
          select o.bucket, o.organisation_name, o.organisation_colour, o.requests, o.tokens
          from public.public_usage_weekly_organisations o
          where o.bucket >= date_trunc('week', v_since)
        ),
        top_groups as (
          select base.organisation_name as group_name
          from base
          group by base.organisation_name
          order by sum(base.tokens) desc
          limit p_top_n
        ),
        bucketed as (
          select
            base.bucket as time_bucket,
            case
              when base.organisation_name in (select group_name from top_groups) then base.organisation_name
              else 'Other'
            end as group_name,
            sum(base.requests) as req_count,
            sum(base.tokens) as tok_count,
            max(case
              when base.organisation_name in (select group_name from top_groups) then base.organisation_colour
              else null
            end) as group_colour
          from base
          group by time_bucket, group_name
        )
        select
          b.time_bucket as bucket,
          b.group_name as name,
          b.req_count::bigint as requests,
          b.tok_count::bigint as tokens,
          b.group_colour as colour
        from bucketed b
        order by b.time_bucket, b.tok_count desc;

        return;
      end if;
    else
      select count(*)
      into v_rollup_count
      from public.public_usage_weekly_providers p
      where p.bucket >= date_trunc('week', v_since);

      if v_rollup_count > 0 then
        return query
        with base as (
          select p.bucket, p.provider, p.requests, p.tokens, ap.colour as provider_colour
          from public.public_usage_weekly_providers p
          left join public.data_api_providers ap on ap.api_provider_id = p.provider
          where p.bucket >= date_trunc('week', v_since)
        ),
        top_groups as (
          select base.provider as group_name
          from base
          group by base.provider
          order by sum(base.tokens) desc
          limit p_top_n
        ),
        bucketed as (
          select
            base.bucket as time_bucket,
            case
              when base.provider in (select group_name from top_groups) then base.provider
              else 'Other'
            end as group_name,
            sum(base.requests) as req_count,
            sum(base.tokens) as tok_count,
            max(case
              when base.provider in (select group_name from top_groups) then base.provider_colour
              else null
            end) as group_colour
          from base
          group by time_bucket, group_name
        )
        select
          b.time_bucket as bucket,
          b.group_name as name,
          b.req_count::bigint as requests,
          b.tok_count::bigint as tokens,
          b.group_colour as colour
        from bucketed b
        order by b.time_bucket, b.tok_count desc;

        return;
      end if;
    end if;
  end if;

  if p_dimension = 'organization' then
    return query
    with bucketed as (
      select
        case
          when p_bucket_size = 'hour' then date_trunc('hour', gr.created_at)
          when p_bucket_size = 'day' then date_trunc('day', gr.created_at)
          when p_bucket_size = 'week' then date_trunc('week', gr.created_at)
          when p_bucket_size = 'month' then date_trunc('month', gr.created_at)
          else date_trunc('week', gr.created_at)
        end as time_bucket,
        coalesce(org.name, dm.organisation_id) as group_name,
        count(*) as req_count,
        sum(coalesce((gr.usage->>'total_tokens')::bigint, 0)) as tok_count,
        max(org.colour) as group_colour
      from public.gateway_requests gr
      join public.data_models dm on gr.model_id = dm.model_id
      left join public.data_organisations org on dm.organisation_id = org.organisation_id
      where gr.created_at >= v_since
        and dm.organisation_id is not null
      group by time_bucket, group_name
    )
    select
      b.time_bucket as bucket,
      b.group_name as name,
      b.req_count::bigint as requests,
      b.tok_count::bigint as tokens,
      b.group_colour as colour
    from bucketed b
    order by b.time_bucket, b.tok_count desc;
  else
    return query
    with bucketed as (
      select
        case
          when p_bucket_size = 'hour' then date_trunc('hour', gr.created_at)
          when p_bucket_size = 'day' then date_trunc('day', gr.created_at)
          when p_bucket_size = 'week' then date_trunc('week', gr.created_at)
          when p_bucket_size = 'month' then date_trunc('month', gr.created_at)
          else date_trunc('week', gr.created_at)
        end as time_bucket,
        gr.provider as group_name,
        count(*) as req_count,
        sum(coalesce((gr.usage->>'total_tokens')::bigint, 0)) as tok_count,
        max(ap.colour) as group_colour
      from public.gateway_requests gr
      left join public.data_api_providers ap on ap.api_provider_id = gr.provider
      where gr.created_at >= v_since
        and gr.provider is not null
        and gr.provider <> ''
      group by time_bucket, group_name
    )
    select
      b.time_bucket as bucket,
      b.group_name as name,
      b.req_count::bigint as requests,
      b.tok_count::bigint as tokens,
      b.group_colour as colour
    from bucketed b
    order by b.time_bucket, b.tok_count desc;
  end if;
end;
$$ language plpgsql stable;

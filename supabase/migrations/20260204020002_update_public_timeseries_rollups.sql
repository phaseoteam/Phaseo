-- Use weekly rollup tables for public timeseries charts (fallback to raw for other buckets)

create or replace function public.get_public_usage_timeseries(
  p_time_range text default 'week',
  p_bucket_size text default 'hour',
  p_top_n integer default 10
)
returns table (
  bucket timestamp with time zone,
  model_id text,
  requests bigint,
  tokens bigint
) as $$
declare
  v_since timestamptz;
begin
  case p_time_range
    when '24h' then v_since := now() - interval '24 hours';
    when 'week' then v_since := now() - interval '7 days';
    when 'month' then v_since := now() - interval '30 days';
    when 'year' then v_since := now() - interval '1 year';
    else v_since := now() - interval '7 days';
  end case;

  if p_bucket_size = 'week' then
    return query
    with base as (
      select *
      from public.public_usage_weekly_models
      where bucket >= date_trunc('week', v_since)
    ),
    top_models as (
      select model_id
      from base
      group by model_id
      order by sum(requests) desc
      limit p_top_n
    ),
    bucketed as (
      select
        bucket as time_bucket,
        case
          when model_id in (select model_id from top_models) then model_id
          else 'Other'
        end as model_group,
        sum(requests) as req_count,
        sum(tokens) as tok_count
      from base
      group by time_bucket, model_group
    )
    select
      b.time_bucket,
      b.model_group,
      b.req_count::bigint,
      b.tok_count::bigint
    from bucketed b
    order by b.time_bucket, b.req_count desc;
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
    bd.time_bucket,
    bd.model_group,
    bd.req_count::bigint,
    bd.tok_count::bigint
  from bucketed_data bd
  order by bd.time_bucket, bd.req_count desc;
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
  tokens bigint
) as $$
declare
  v_since timestamptz;
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
      return query
      with base as (
        select *
        from public.public_usage_weekly_organisations
        where bucket >= date_trunc('week', v_since)
      ),
      top_groups as (
        select organisation_name as group_name
        from base
        group by organisation_name
        order by sum(requests) desc
        limit p_top_n
      ),
      bucketed as (
        select
          bucket as time_bucket,
          case
            when organisation_name in (select group_name from top_groups) then organisation_name
            else 'Other'
          end as group_name,
          sum(requests) as req_count,
          sum(tokens) as tok_count
        from base
        group by time_bucket, group_name
      )
      select
        b.time_bucket,
        b.group_name,
        b.req_count::bigint,
        b.tok_count::bigint
      from bucketed b
      order by b.time_bucket, b.req_count desc;
    else
      return query
      with base as (
        select *
        from public.public_usage_weekly_providers
        where bucket >= date_trunc('week', v_since)
      ),
      top_groups as (
        select provider as group_name
        from base
        group by provider
        order by sum(requests) desc
        limit p_top_n
      ),
      bucketed as (
        select
          bucket as time_bucket,
          case
            when provider in (select group_name from top_groups) then provider
            else 'Other'
          end as group_name,
          sum(requests) as req_count,
          sum(tokens) as tok_count
        from base
        group by time_bucket, group_name
      )
      select
        b.time_bucket,
        b.group_name,
        b.req_count::bigint,
        b.tok_count::bigint
      from bucketed b
      order by b.time_bucket, b.req_count desc;
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
        coalesce(org.name, dm.organisation_id, 'Unknown') as group_name,
        count(*) as req_count,
        sum(coalesce((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
      from public.gateway_requests gr
      left join public.data_models dm on gr.model_id = dm.model_id
      left join public.data_organisations org on dm.organisation_id = org.organisation_id
      where gr.created_at >= v_since
      group by time_bucket, group_name
    )
    select
      b.time_bucket,
      b.group_name,
      b.req_count::bigint,
      b.tok_count::bigint
    from bucketed b
    order by b.time_bucket, b.req_count desc;
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
        coalesce(gr.provider, 'Unknown') as group_name,
        count(*) as req_count,
        sum(coalesce((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
      from public.gateway_requests gr
      where gr.created_at >= v_since
      group by time_bucket, group_name
    )
    select
      b.time_bucket,
      b.group_name,
      b.req_count::bigint,
      b.tok_count::bigint
    from bucketed b
    order by b.time_bucket, b.req_count desc;
  end if;
end;
$$ language plpgsql stable;

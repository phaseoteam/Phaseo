-- Filter unknown organisations/providers from market share rollups and RPCs

create or replace function public.refresh_public_usage_rollups(
  p_since timestamptz default now() - interval '1 year'
)
returns void
language plpgsql
as $$
declare
  v_since timestamptz := date_trunc('week', p_since);
begin
  delete from public.public_usage_weekly_models where bucket >= v_since;
  delete from public.public_usage_weekly_providers where bucket >= v_since;
  delete from public.public_usage_weekly_organisations where bucket >= v_since;

  insert into public.public_usage_weekly_models (bucket, model_id, requests, tokens)
  select
    date_trunc('week', gr.created_at) as bucket,
    coalesce(gr.model_id, 'Unknown') as model_id,
    count(*)::bigint as requests,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
  from public.gateway_requests gr
  where gr.created_at >= v_since
  group by 1, 2;

  insert into public.public_usage_weekly_providers (bucket, provider, requests, tokens)
  select
    date_trunc('week', gr.created_at) as bucket,
    gr.provider as provider,
    count(*)::bigint as requests,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
  from public.gateway_requests gr
  where gr.created_at >= v_since
    and gr.provider is not null
    and gr.provider <> ''
  group by 1, 2;

  insert into public.public_usage_weekly_organisations (
    bucket,
    organisation_name,
    organisation_colour,
    requests,
    tokens
  )
  select
    date_trunc('week', gr.created_at) as bucket,
    coalesce(org.name, dm.organisation_id) as organisation_name,
    max(org.colour) as organisation_colour,
    count(*)::bigint as requests,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
  from public.gateway_requests gr
  join public.data_models dm on gr.model_id = dm.model_id
  left join public.data_organisations org on dm.organisation_id = org.organisation_id
  where gr.created_at >= v_since
    and dm.organisation_id is not null
  group by 1, 2;
end;
$$;
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
          select p.bucket, p.provider, p.requests, p.tokens
          from public.public_usage_weekly_providers p
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
            sum(base.tokens) as tok_count
          from base
          group by time_bucket, group_name
        )
        select
          b.time_bucket as bucket,
          b.group_name as name,
          b.req_count::bigint as requests,
          b.tok_count::bigint as tokens,
          null::text as colour
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
        sum(coalesce((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
      from public.gateway_requests gr
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
      null::text as colour
    from bucketed b
    order by b.time_bucket, b.tok_count desc;
  end if;
end;
$$ language plpgsql stable;
select public.refresh_public_usage_rollups();

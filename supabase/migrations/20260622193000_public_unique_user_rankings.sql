-- Add public unique-user rankings without querying raw gateway_requests from page loads.
--
-- The raw actor id is normalized and hashed into this rollup. Public reads only
-- expose aggregate counts by model and time bucket.

create table if not exists public.public_model_user_usage_daily (
  day_bucket date not null,
  model_id text not null,
  provider_id text not null,
  actor_hash text not null,
  requests bigint not null default 0,
  tokens bigint not null default 0,
  refreshed_at timestamptz not null default now(),
  constraint public_model_user_usage_daily_pkey
    primary key (day_bucket, model_id, provider_id, actor_hash)
);

create index if not exists public_model_user_usage_daily_model_day_idx
  on public.public_model_user_usage_daily (model_id, day_bucket desc);

create index if not exists public_model_user_usage_daily_day_idx
  on public.public_model_user_usage_daily (day_bucket desc);

comment on table public.public_model_user_usage_daily is
  'Daily privacy-safe actor rollup for public model unique-user leaderboards.';

create or replace function public.refresh_public_model_user_usage_daily(
  p_since timestamptz default now() - interval '90 days',
  p_until timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since_date date := date_trunc('day', p_since at time zone 'utc')::date;
  v_until_date date := date_trunc('day', p_until at time zone 'utc')::date;
begin
  delete from public.public_model_user_usage_daily d
  where d.day_bucket >= v_since_date
    and d.day_bucket <= v_until_date;

  insert into public.public_model_user_usage_daily (
    day_bucket,
    model_id,
    provider_id,
    actor_hash,
    requests,
    tokens,
    refreshed_at
  )
  with normalized as (
    select
      date_trunc('day', gr.created_at at time zone 'utc')::date as day_bucket,
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.routed_model_id, ''),
        nullif(gr.requested_model_id, ''),
        nullif(gr.model_id, ''),
        'unknown'
      ) as model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      coalesce(
        nullif(to_jsonb(gr)->>'oauth_user_id', ''),
        nullif(to_jsonb(gr)->>'end_user_id', ''),
        nullif(to_jsonb(gr)->>'workspace_id', ''),
        nullif(to_jsonb(gr)->>'team_id', ''),
        nullif(to_jsonb(gr)->>'key_id', '')
      ) as actor_key,
      public.gateway_usage_nonnegative_bigint(
        coalesce(
          public.gateway_usage_total_tokens(gr.usage),
          gr.usage_total_tokens,
          0
        )
      ) as total_tokens
    from public.gateway_requests gr
    where gr.created_at >= p_since
      and gr.created_at < p_until
      and gr.success is true
  )
  select
    n.day_bucket,
    n.model_id,
    n.provider_id,
    md5('public-model-user:' || n.actor_key) as actor_hash,
    count(*)::bigint as requests,
    sum(n.total_tokens)::bigint as tokens,
    now() as refreshed_at
  from normalized n
  where n.actor_key is not null
    and n.model_id is not null
    and n.model_id <> ''
    and lower(n.model_id) not in ('unknown', 'other')
  group by n.day_bucket, n.model_id, n.provider_id, md5('public-model-user:' || n.actor_key);
end;
$$;

grant execute on function public.refresh_public_model_user_usage_daily(timestamptz, timestamptz)
  to service_role;

drop function if exists public.get_public_unique_user_timeseries(text, text, integer);

create or replace function public.get_public_unique_user_timeseries(
  p_time_range text default 'year',
  p_bucket_size text default 'week',
  p_top_n integer default 10
)
returns table (
  bucket timestamp with time zone,
  model_id text,
  requests bigint,
  tokens bigint,
  users bigint,
  colour text
)
language plpgsql
stable
as $$
#variable_conflict use_column
declare
  v_since date;
begin
  case p_time_range
    when '24h' then v_since := (now() at time zone 'utc')::date - 1;
    when 'today' then v_since := (now() at time zone 'utc')::date;
    when 'week' then v_since := (now() at time zone 'utc')::date - 7;
    when 'month' then v_since := (now() at time zone 'utc')::date - 30;
    when 'year' then v_since := (now() at time zone 'utc')::date - 365;
    else v_since := (now() at time zone 'utc')::date - 365;
  end case;

  return query
  with actor_rows as (
    select
      case
        when p_bucket_size = 'month' then date_trunc('month', d.day_bucket::timestamp)::timestamptz
        when p_bucket_size = 'day' then d.day_bucket::timestamptz
        else date_trunc('week', d.day_bucket::timestamp)::timestamptz
      end as time_bucket,
      d.model_id,
      d.actor_hash,
      sum(d.requests)::bigint as req_count,
      sum(d.tokens)::bigint as tok_count
    from public.public_model_user_usage_daily d
    where d.day_bucket >= v_since
      and lower(d.model_id) not in ('unknown', 'other')
    group by 1, 2, 3
  ),
  base as (
    select
      ar.time_bucket,
      ar.model_id,
      sum(ar.req_count)::bigint as req_count,
      sum(ar.tok_count)::bigint as tok_count,
      count(distinct ar.actor_hash)::bigint as user_count
    from actor_rows ar
    group by ar.time_bucket, ar.model_id
  ),
  ranked_base as (
    select
      b.*,
      row_number() over (
        partition by b.time_bucket
        order by b.user_count desc, b.tok_count desc, b.req_count desc, b.model_id
      ) as bucket_rank
    from base b
    where b.user_count > 0
  ),
  bucketed as (
    select
      ar.time_bucket,
      case
        when rb.bucket_rank <= greatest(p_top_n, 1) then ar.model_id
        else 'Other'
      end as model_group,
      sum(ar.req_count)::bigint as req_count,
      sum(ar.tok_count)::bigint as tok_count,
      count(distinct ar.actor_hash)::bigint as user_count
    from actor_rows ar
    left join ranked_base rb
      on rb.time_bucket = ar.time_bucket
      and rb.model_id = ar.model_id
    group by ar.time_bucket, model_group
  )
  select
    b.time_bucket as bucket,
    b.model_group as model_id,
    b.req_count as requests,
    b.tok_count as tokens,
    b.user_count as users,
    case
      when b.model_group = 'Other' then null
      else org.colour
    end as colour
  from bucketed b
  left join public.data_models dm on dm.model_id = b.model_group
  left join public.data_organisations org on dm.organisation_id = org.organisation_id
  where b.user_count > 0
  order by b.time_bucket, b.user_count desc, b.tok_count desc;
end;
$$;

grant execute on function public.get_public_unique_user_timeseries(text, text, integer)
  to anon, authenticated, service_role;

do $$
declare
  v_job_id int;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  select jobid into v_job_id
  from cron.job
  where jobname = 'refresh-public-model-user-usage-daily'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'refresh-public-model-user-usage-daily',
    '11 * * * *',
    $sql$select public.refresh_public_model_user_usage_daily(now() - interval '90 days', now());$sql$
  );
exception
  when others then
    null;
end $$;

select public.refresh_public_model_user_usage_daily(now() - interval '1 year', now());

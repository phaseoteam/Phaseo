-- Rollup tables for public rankings charts (weekly buckets)

create table if not exists public.public_usage_weekly_models (
  bucket timestamptz not null,
  model_id text not null,
  requests bigint not null,
  tokens bigint not null,
  primary key (bucket, model_id)
);
create index if not exists idx_public_usage_weekly_models_bucket
  on public.public_usage_weekly_models (bucket);
create table if not exists public.public_usage_weekly_providers (
  bucket timestamptz not null,
  provider text not null,
  requests bigint not null,
  tokens bigint not null,
  primary key (bucket, provider)
);
create index if not exists idx_public_usage_weekly_providers_bucket
  on public.public_usage_weekly_providers (bucket);
create table if not exists public.public_usage_weekly_organisations (
  bucket timestamptz not null,
  organisation_name text not null,
  requests bigint not null,
  tokens bigint not null,
  primary key (bucket, organisation_name)
);
create index if not exists idx_public_usage_weekly_organisations_bucket
  on public.public_usage_weekly_organisations (bucket);
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
    coalesce(gr.provider, 'Unknown') as provider,
    count(*)::bigint as requests,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
  from public.gateway_requests gr
  where gr.created_at >= v_since
  group by 1, 2;

  insert into public.public_usage_weekly_organisations (bucket, organisation_name, requests, tokens)
  select
    date_trunc('week', gr.created_at) as bucket,
    coalesce(org.name, dm.organisation_id, 'Unknown') as organisation_name,
    count(*)::bigint as requests,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
  from public.gateway_requests gr
  left join public.data_models dm on gr.model_id = dm.model_id
  left join public.data_organisations org on dm.organisation_id = org.organisation_id
  where gr.created_at >= v_since
  group by 1, 2;
end;
$$;
-- Initial backfill for the last year
select public.refresh_public_usage_rollups();

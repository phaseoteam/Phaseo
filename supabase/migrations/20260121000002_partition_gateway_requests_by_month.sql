-- =========================
-- gateway_requests: partition by month (created_at)
-- =========================
-- NOTE: This rebuilds the table; run during low traffic.

alter table public.gateway_requests rename to gateway_requests_old;
-- Drop old PK constraint so the new table can reuse the name.
alter table public.gateway_requests_old
  drop constraint if exists gateway_requests_pkey;
create table public.gateway_requests (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  team_id uuid not null,
  request_id text not null,
  app_id uuid null,
  endpoint text not null,
  model_id text null,
  provider text null,
  native_response_id text null,
  stream boolean not null default false,
  byok boolean not null default false,
  status_code integer null,
  success boolean not null default false,
  error_code text null,
  error_message text null,
  latency_ms integer null,
  generation_ms integer null,
  usage jsonb not null default '{}'::jsonb,
  cost_nanos bigint null,
  currency text null,
  pricing_lines jsonb not null default '[]'::jsonb,
  key_id uuid null,
  throughput numeric null,
  location text null,
  constraint gateway_requests_pkey primary key (id, created_at),
  constraint gateway_requests_key_id_fkey foreign key (key_id) references public.keys (id) on delete set null,
  constraint gateway_requests_team_id_fkey foreign key (team_id) references public.teams (id) on delete cascade
) partition by range (created_at);
do $$
declare
  start_ts timestamptz;
  end_ts timestamptz;
  cur_ts timestamptz;
begin
  select date_trunc('month', min(created_at)) into start_ts from public.gateway_requests_old;
  select date_trunc('month', max(created_at)) into end_ts from public.gateway_requests_old;

  if start_ts is null or end_ts is null then
    start_ts := date_trunc('month', now());
    end_ts := start_ts;
  end if;

  cur_ts := start_ts;
  while cur_ts <= end_ts loop
    execute format(
      'create table if not exists public.gateway_requests_%s partition of public.gateway_requests for values from (%L) to (%L)',
      to_char(cur_ts, 'YYYY_MM'),
      cur_ts,
      cur_ts + interval '1 month'
    );
    cur_ts := cur_ts + interval '1 month';
  end loop;

  cur_ts := date_trunc('month', now()) + interval '1 month';
  execute format(
    'create table if not exists public.gateway_requests_%s partition of public.gateway_requests for values from (%L) to (%L)',
    to_char(cur_ts, 'YYYY_MM'),
    cur_ts,
    cur_ts + interval '1 month'
  );
end $$;
create table if not exists public.gateway_requests_default
  partition of public.gateway_requests default;
insert into public.gateway_requests (
  id,
  created_at,
  team_id,
  request_id,
  app_id,
  endpoint,
  model_id,
  provider,
  native_response_id,
  stream,
  byok,
  status_code,
  success,
  error_code,
  error_message,
  latency_ms,
  generation_ms,
  usage,
  cost_nanos,
  currency,
  pricing_lines,
  key_id,
  throughput,
  location
)
select
  id,
  created_at,
  team_id,
  request_id,
  app_id,
  endpoint,
  model_id,
  provider,
  native_response_id,
  stream,
  byok,
  status_code,
  success,
  error_code,
  error_message,
  latency_ms,
  generation_ms,
  usage,
  cost_nanos,
  currency,
  pricing_lines,
  key_id,
  throughput,
  location
from public.gateway_requests_old;
create index if not exists gateway_requests_created_idx
  on public.gateway_requests (created_at);
create index if not exists gateway_requests_team_created_idx
  on public.gateway_requests (team_id, created_at);
create index if not exists gateway_requests_key_created_idx
  on public.gateway_requests (key_id, created_at);
drop table public.gateway_requests_old;

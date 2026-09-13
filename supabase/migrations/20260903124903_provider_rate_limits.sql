create table public.provider_rate_limits (
  provider_id text primary key
    references public.v2_providers(provider_slug) on update cascade on delete cascade,
  requests_per_minute bigint,
  requests_per_day bigint,
  tokens_per_minute bigint,
  tokens_per_day bigint,
  headroom_bps integer not null default 500,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_rate_limits_requests_per_minute_positive
    check (requests_per_minute is null or requests_per_minute > 0),
  constraint provider_rate_limits_requests_per_day_positive
    check (requests_per_day is null or requests_per_day > 0),
  constraint provider_rate_limits_tokens_per_minute_positive
    check (tokens_per_minute is null or tokens_per_minute > 0),
  constraint provider_rate_limits_tokens_per_day_positive
    check (tokens_per_day is null or tokens_per_day > 0),
  constraint provider_rate_limits_headroom_bps_range
    check (headroom_bps between 0 and 5000),
  constraint provider_rate_limits_has_limit
    check (
      requests_per_minute is not null
      or requests_per_day is not null
      or tokens_per_minute is not null
      or tokens_per_day is not null
    )
);

comment on table public.provider_rate_limits is
  'Gateway-managed upstream provider capacity limits. Enforcement is approximate and scoped to the managed provider credential.';
comment on column public.provider_rate_limits.headroom_bps is
  'Capacity held back to absorb token usage from requests that are still in flight.';

alter table public.provider_rate_limits enable row level security;

revoke all on table public.provider_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.provider_rate_limits to service_role;

-- Persisted circuit-breaker state for provider/model/endpoint tuples.
-- Used by web dashboards to display deranked/recovering status without querying runtime KV.

create table if not exists public.gateway_provider_health_states (
  provider_id text not null,
  model_id text not null,
  endpoint text not null,
  breaker_state text not null default 'closed',
  is_deranked boolean not null default false,
  open_until_ms bigint not null default 0,
  open_until timestamptz null,
  last_transition_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_reason text null,
  constraint gateway_provider_health_states_pkey
    primary key (provider_id, model_id, endpoint),
  constraint gateway_provider_health_states_breaker_state_chk
    check (breaker_state in ('closed', 'open', 'half_open'))
);
create index if not exists gateway_provider_health_states_provider_updated_idx
  on public.gateway_provider_health_states (provider_id, updated_at desc);
create index if not exists gateway_provider_health_states_deranked_idx
  on public.gateway_provider_health_states (provider_id, is_deranked, updated_at desc);

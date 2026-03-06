-- Add independent routing status controls while preserving provider rollout status.
-- Rollout status remains on data_api_providers.status (Active/Beta/Alpha/NotReady).
-- New routing switches are normalized to:
--   active | deranked-lvl1 | deranked-lvl2 | deranked-lvl3 | disabled

do $$
begin
  if exists (
    select 1 from pg_type where typname = 'data_api_provider_capability_status'
  ) then
    if not exists (
      select 1
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      where t.typname = 'data_api_provider_capability_status'
        and e.enumlabel = 'deranked_lvl1'
    ) then
      alter type public.data_api_provider_capability_status add value 'deranked_lvl1';
    end if;

    if not exists (
      select 1
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      where t.typname = 'data_api_provider_capability_status'
        and e.enumlabel = 'deranked_lvl2'
    ) then
      alter type public.data_api_provider_capability_status add value 'deranked_lvl2';
    end if;

    if not exists (
      select 1
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      where t.typname = 'data_api_provider_capability_status'
        and e.enumlabel = 'deranked_lvl3'
    ) then
      alter type public.data_api_provider_capability_status add value 'deranked_lvl3';
    end if;
  end if;
end $$;

-- NOTE: Postgres enum values cannot always be used in the same transaction
-- where they are added. We keep legacy 'deranked' rows as-is for now; runtime
-- normalization already treats them as lvl1.

alter table if exists public.data_api_providers
  add column if not exists routing_status text;

update public.data_api_providers
set routing_status = case
  when routing_status is null then 'active'
  when lower(trim(routing_status)) in ('active') then 'active'
  when lower(trim(routing_status)) in ('deranked', 'deranked_lvl1', 'deranked-lvl1') then 'deranked-lvl1'
  when lower(trim(routing_status)) in ('deranked_lvl2', 'deranked-lvl2') then 'deranked-lvl2'
  when lower(trim(routing_status)) in ('deranked_lvl3', 'deranked-lvl3') then 'deranked-lvl3'
  when lower(trim(routing_status)) in ('disabled', 'notready', 'not_ready', 'not-ready') then 'disabled'
  else 'active'
end;

alter table if exists public.data_api_providers
  alter column routing_status set default 'active';

alter table if exists public.data_api_providers
  alter column routing_status set not null;

alter table if exists public.data_api_providers
  drop constraint if exists data_api_providers_routing_status_check;

alter table if exists public.data_api_providers
  add constraint data_api_providers_routing_status_check
  check (routing_status in ('active', 'deranked-lvl1', 'deranked-lvl2', 'deranked-lvl3', 'disabled'));

alter table if exists public.data_api_provider_models
  add column if not exists routing_status text;

update public.data_api_provider_models
set routing_status = case
  when routing_status is null then 'active'
  when lower(trim(routing_status)) in ('active') then 'active'
  when lower(trim(routing_status)) in ('deranked', 'deranked_lvl1', 'deranked-lvl1') then 'deranked-lvl1'
  when lower(trim(routing_status)) in ('deranked_lvl2', 'deranked-lvl2') then 'deranked-lvl2'
  when lower(trim(routing_status)) in ('deranked_lvl3', 'deranked-lvl3') then 'deranked-lvl3'
  when lower(trim(routing_status)) in ('disabled', 'notready', 'not_ready', 'not-ready') then 'disabled'
  else 'active'
end;

alter table if exists public.data_api_provider_models
  alter column routing_status set default 'active';

alter table if exists public.data_api_provider_models
  alter column routing_status set not null;

alter table if exists public.data_api_provider_models
  drop constraint if exists data_api_provider_models_routing_status_check;

alter table if exists public.data_api_provider_models
  add constraint data_api_provider_models_routing_status_check
  check (routing_status in ('active', 'deranked-lvl1', 'deranked-lvl2', 'deranked-lvl3', 'disabled'));



-- Team-level default for cache-aware routing behavior.
alter table if exists public.team_settings
  add column if not exists cache_aware_routing_enabled boolean not null default true;


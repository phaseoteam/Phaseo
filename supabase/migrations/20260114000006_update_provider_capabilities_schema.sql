-- Align provider capability schema to single-table params with status.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_api_provider_capability_status') then
    create type public.data_api_provider_capability_status as enum ('active', 'deranked', 'disabled');
  end if;
end $$;
alter table if exists public.data_api_provider_model_capabilities
  add column if not exists status public.data_api_provider_capability_status not null default 'active';
alter table if exists public.data_api_provider_model_capabilities
  alter column params set default '{}'::jsonb;
drop table if exists public.data_api_provider_capabilities_param;

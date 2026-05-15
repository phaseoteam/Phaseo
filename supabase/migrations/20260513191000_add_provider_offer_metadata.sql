alter table if exists public.data_api_providers
  add column if not exists provider_family_id text;

update public.data_api_providers
set provider_family_id = api_provider_id
where provider_family_id is null or btrim(provider_family_id) = '';

alter table if exists public.data_api_providers
  add column if not exists offer_label text;

alter table if exists public.data_api_providers
  add column if not exists offer_scope text;

update public.data_api_providers
set offer_scope = 'global'
where offer_scope is null or btrim(offer_scope) = '';

alter table if exists public.data_api_providers
  alter column offer_scope set default 'global';

alter table if exists public.data_api_providers
  drop constraint if exists data_api_providers_offer_scope_check;

alter table if exists public.data_api_providers
  add constraint data_api_providers_offer_scope_check
  check (offer_scope in ('global', 'regional', 'specialized'));

create index if not exists data_api_providers_provider_family_idx
  on public.data_api_providers (provider_family_id);

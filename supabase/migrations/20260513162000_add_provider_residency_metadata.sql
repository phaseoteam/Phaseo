-- Track provider-level execution/data residency posture for routing and UI.
-- This is intentionally provider-level first; provider-model overrides can be added later.

alter table if exists public.data_api_providers
  add column if not exists residency_mode text;
update public.data_api_providers
set residency_mode = case
  when residency_mode is null then 'unknown'
  when lower(trim(residency_mode)) in ('unknown') then 'unknown'
  when lower(trim(residency_mode)) in ('provider_managed', 'provider-managed') then 'provider_managed'
  when lower(trim(residency_mode)) in ('customer_selectable', 'customer-selectable', 'customer selectable') then 'customer_selectable'
  when lower(trim(residency_mode)) in ('account_selected', 'account-selected', 'account selected') then 'account_selected'
  else 'unknown'
end;
alter table if exists public.data_api_providers
  alter column residency_mode set default 'unknown';
alter table if exists public.data_api_providers
  alter column residency_mode set not null;
alter table if exists public.data_api_providers
  drop constraint if exists data_api_providers_residency_mode_check;
alter table if exists public.data_api_providers
  add constraint data_api_providers_residency_mode_check
  check (
    residency_mode in (
      'unknown',
      'provider_managed',
      'customer_selectable',
      'account_selected'
    )
  );

alter table if exists public.data_api_providers
  add column if not exists default_execution_regions text[];
alter table if exists public.data_api_providers
  add column if not exists default_data_regions text[];

alter table if exists public.data_api_providers
  add column if not exists zero_data_retention text;
update public.data_api_providers
set zero_data_retention = case
  when zero_data_retention is null then 'unknown'
  when lower(trim(zero_data_retention)) in ('unknown') then 'unknown'
  when lower(trim(zero_data_retention)) in ('unsupported') then 'unsupported'
  when lower(trim(zero_data_retention)) in ('optional') then 'optional'
  when lower(trim(zero_data_retention)) in ('default') then 'default'
  else 'unknown'
end;
alter table if exists public.data_api_providers
  alter column zero_data_retention set default 'unknown';
alter table if exists public.data_api_providers
  alter column zero_data_retention set not null;
alter table if exists public.data_api_providers
  drop constraint if exists data_api_providers_zero_data_retention_check;
alter table if exists public.data_api_providers
  add constraint data_api_providers_zero_data_retention_check
  check (
    zero_data_retention in (
      'unknown',
      'unsupported',
      'optional',
      'default'
    )
  );

alter table if exists public.data_api_providers
  add column if not exists residency_source_url text;
alter table if exists public.data_api_providers
  add column if not exists residency_notes text;

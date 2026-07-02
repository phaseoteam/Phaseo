-- Add explicit provider data-policy tiers for clearer storage and UI.
-- These complement existing prompt_training_policy metadata rather than replacing it.

alter table if exists public.data_api_providers
  add column if not exists data_policy_tier text;
update public.data_api_providers
set data_policy_tier = case
  when data_policy_tier is null then 'unknown'
  when lower(trim(data_policy_tier)) in ('unknown') then 'unknown'
  when lower(trim(data_policy_tier)) in ('private') then 'private'
  when lower(trim(data_policy_tier)) in ('logs', 'logged') then 'logs'
  when lower(trim(data_policy_tier)) in ('trains', 'train') then 'trains'
  else 'unknown'
end;
alter table if exists public.data_api_providers
  alter column data_policy_tier set default 'unknown';
alter table if exists public.data_api_providers
  alter column data_policy_tier set not null;
alter table if exists public.data_api_providers
  drop constraint if exists data_api_providers_data_policy_tier_check;
alter table if exists public.data_api_providers
  add constraint data_api_providers_data_policy_tier_check
  check (
    data_policy_tier in (
      'unknown',
      'private',
      'logs',
      'trains'
    )
  );

alter table if exists public.data_api_providers
  add column if not exists data_policy_confidence text;
update public.data_api_providers
set data_policy_confidence = case
  when data_policy_confidence is null then 'unknown'
  when lower(trim(data_policy_confidence)) in ('unknown') then 'unknown'
  when lower(trim(data_policy_confidence)) in ('confirmed', 'certain') then 'confirmed'
  when lower(trim(data_policy_confidence)) in ('maybe', 'uncertain', 'inferred') then 'maybe'
  else 'unknown'
end;
alter table if exists public.data_api_providers
  alter column data_policy_confidence set default 'unknown';
alter table if exists public.data_api_providers
  alter column data_policy_confidence set not null;
alter table if exists public.data_api_providers
  drop constraint if exists data_api_providers_data_policy_confidence_check;
alter table if exists public.data_api_providers
  add constraint data_api_providers_data_policy_confidence_check
  check (
    data_policy_confidence in (
      'unknown',
      'confirmed',
      'maybe'
    )
  );

alter table if exists public.data_api_providers
  add column if not exists data_policy_contract_mode text;
update public.data_api_providers
set data_policy_contract_mode = case
  when data_policy_contract_mode is null then 'none'
  when lower(trim(data_policy_contract_mode)) in ('none', 'unknown') then 'none'
  when lower(trim(data_policy_contract_mode)) in ('customer_agreement', 'customer-agreement', 'agreement') then 'customer_agreement'
  when lower(trim(data_policy_contract_mode)) in ('enterprise_agreement', 'enterprise-agreement', 'enterprise') then 'enterprise_agreement'
  else 'none'
end;
alter table if exists public.data_api_providers
  alter column data_policy_contract_mode set default 'none';
alter table if exists public.data_api_providers
  alter column data_policy_contract_mode set not null;
alter table if exists public.data_api_providers
  drop constraint if exists data_api_providers_data_policy_contract_mode_check;
alter table if exists public.data_api_providers
  add constraint data_api_providers_data_policy_contract_mode_check
  check (
    data_policy_contract_mode in (
      'none',
      'customer_agreement',
      'enterprise_agreement'
    )
  );

alter table if exists public.data_api_providers
  add column if not exists data_policy_contract_notes text;

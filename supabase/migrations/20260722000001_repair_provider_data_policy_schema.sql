-- Repair the provider data-policy columns if the original migration was
-- recorded without applying its ALTER TABLE statements to the live schema.

alter table if exists public.data_api_providers
  add column if not exists data_policy_tier text;

alter table if exists public.data_api_providers
  add column if not exists data_policy_confidence text;

alter table if exists public.data_api_providers
  add column if not exists data_policy_contract_mode text;

alter table if exists public.data_api_providers
  add column if not exists data_policy_contract_notes text;

update public.data_api_providers
set
  data_policy_tier = case
    when lower(trim(coalesce(data_policy_tier, ''))) in ('private') then 'private'
    when lower(trim(coalesce(data_policy_tier, ''))) in ('logs', 'logged') then 'logs'
    when lower(trim(coalesce(data_policy_tier, ''))) in ('trains', 'train') then 'trains'
    else 'unknown'
  end,
  data_policy_confidence = case
    when lower(trim(coalesce(data_policy_confidence, ''))) in ('confirmed', 'certain') then 'confirmed'
    when lower(trim(coalesce(data_policy_confidence, ''))) in ('maybe', 'uncertain', 'inferred') then 'maybe'
    else 'unknown'
  end,
  data_policy_contract_mode = case
    when lower(trim(coalesce(data_policy_contract_mode, ''))) in ('customer_agreement', 'customer-agreement', 'agreement') then 'customer_agreement'
    when lower(trim(coalesce(data_policy_contract_mode, ''))) in ('enterprise_agreement', 'enterprise-agreement', 'enterprise') then 'enterprise_agreement'
    else 'none'
  end;

alter table if exists public.data_api_providers
  alter column data_policy_tier set default 'unknown',
  alter column data_policy_tier set not null;

alter table if exists public.data_api_providers
  alter column data_policy_confidence set default 'unknown',
  alter column data_policy_confidence set not null;

alter table if exists public.data_api_providers
  alter column data_policy_contract_mode set default 'none',
  alter column data_policy_contract_mode set not null;

alter table if exists public.data_api_providers
  drop constraint if exists data_api_providers_data_policy_tier_check,
  add constraint data_api_providers_data_policy_tier_check
    check (data_policy_tier in ('unknown', 'private', 'logs', 'trains')),
  drop constraint if exists data_api_providers_data_policy_confidence_check,
  add constraint data_api_providers_data_policy_confidence_check
    check (data_policy_confidence in ('unknown', 'confirmed', 'maybe')),
  drop constraint if exists data_api_providers_data_policy_contract_mode_check,
  add constraint data_api_providers_data_policy_contract_mode_check
    check (data_policy_contract_mode in ('none', 'customer_agreement', 'enterprise_agreement'));

notify pgrst, 'reload schema';

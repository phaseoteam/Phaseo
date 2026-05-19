-- Track provider-level prompt training/data usage posture.
-- This is intentionally provider-level (not model-level) to avoid duplication.

alter table if exists public.data_api_providers
  add column if not exists prompt_training_policy text;
update public.data_api_providers
set prompt_training_policy = case
  when prompt_training_policy is null then 'unknown'
  when lower(trim(prompt_training_policy)) in ('unknown') then 'unknown'
  when lower(trim(prompt_training_policy)) in ('may_train', 'may-train', 'train', 'trains') then 'may_train'
  when lower(trim(prompt_training_policy)) in ('no_train', 'no-train', 'no_training', 'does_not_train', 'does-not-train') then 'no_train'
  when lower(trim(prompt_training_policy)) in ('opt_out_available', 'opt-out', 'opt_out', 'optout') then 'opt_out_available'
  when lower(trim(prompt_training_policy)) in ('enterprise_no_train', 'enterprise-no-train', 'enterprise_only_no_train') then 'enterprise_no_train'
  else 'unknown'
end;
alter table if exists public.data_api_providers
  alter column prompt_training_policy set default 'unknown';
alter table if exists public.data_api_providers
  alter column prompt_training_policy set not null;
alter table if exists public.data_api_providers
  drop constraint if exists data_api_providers_prompt_training_policy_check;
alter table if exists public.data_api_providers
  add constraint data_api_providers_prompt_training_policy_check
  check (
    prompt_training_policy in (
      'unknown',
      'may_train',
      'no_train',
      'opt_out_available',
      'enterprise_no_train'
    )
  );
alter table if exists public.data_api_providers
  add column if not exists prompt_training_notes text;
alter table if exists public.data_api_providers
  add column if not exists prompt_training_source_url text;

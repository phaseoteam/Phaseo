-- Allow model/provider-specific prompt training policy overrides.
-- Default policy remains on data_api_providers; these fields override when set.

alter table if exists public.data_api_provider_models
  add column if not exists prompt_training_policy_override text;
update public.data_api_provider_models
set prompt_training_policy_override = case
  when prompt_training_policy_override is null then null
  when lower(trim(prompt_training_policy_override)) in ('unknown') then 'unknown'
  when lower(trim(prompt_training_policy_override)) in ('may_train', 'may-train', 'train', 'trains') then 'may_train'
  when lower(trim(prompt_training_policy_override)) in ('no_train', 'no-train', 'no_training', 'does_not_train', 'does-not-train') then 'no_train'
  when lower(trim(prompt_training_policy_override)) in ('opt_out_available', 'opt-out', 'opt_out', 'optout') then 'opt_out_available'
  when lower(trim(prompt_training_policy_override)) in ('enterprise_no_train', 'enterprise-no-train', 'enterprise_only_no_train') then 'enterprise_no_train'
  else null
end;
alter table if exists public.data_api_provider_models
  drop constraint if exists data_api_provider_models_prompt_training_policy_override_check;
alter table if exists public.data_api_provider_models
  add constraint data_api_provider_models_prompt_training_policy_override_check
  check (
    prompt_training_policy_override is null
    or prompt_training_policy_override in (
      'unknown',
      'may_train',
      'no_train',
      'opt_out_available',
      'enterprise_no_train'
    )
  );
alter table if exists public.data_api_provider_models
  add column if not exists prompt_training_override_notes text;
alter table if exists public.data_api_provider_models
  add column if not exists prompt_training_override_source_url text;

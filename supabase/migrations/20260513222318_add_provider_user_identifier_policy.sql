alter table if exists public.data_api_providers
  add column if not exists user_identifier_policy text;

update public.data_api_providers
set user_identifier_policy = case
  when user_identifier_policy is null then 'unknown'
  when lower(trim(user_identifier_policy)) in ('unknown') then 'unknown'
  when lower(trim(user_identifier_policy)) in ('sent', 'send', 'yes') then 'sent'
  when lower(trim(user_identifier_policy)) in ('not_sent', 'not-sent', 'no', 'none') then 'not_sent'
  when lower(trim(user_identifier_policy)) in ('varies', 'mixed') then 'varies'
  else 'unknown'
end;

alter table if exists public.data_api_providers
  alter column user_identifier_policy set default 'unknown';

alter table if exists public.data_api_providers
  alter column user_identifier_policy set not null;

alter table if exists public.data_api_providers
  drop constraint if exists data_api_providers_user_identifier_policy_check;

alter table if exists public.data_api_providers
  add constraint data_api_providers_user_identifier_policy_check
  check (user_identifier_policy in ('unknown', 'sent', 'not_sent', 'varies'));

alter table if exists public.data_api_providers
  add column if not exists user_identifier_notes text;

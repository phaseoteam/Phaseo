alter table if exists public.data_api_providers
  add column if not exists privacy_policy_url text;

alter table if exists public.data_api_providers
  add column if not exists terms_of_service_url text;

-- Version webhook endpoint encryption keys independently from API key peppers.

alter table public.gateway_webhook_endpoints
  add column if not exists secret_key_version text null;

comment on column public.gateway_webhook_endpoints.secret_key_version is
  'Version identifier for the dedicated async webhook secret encryption key.';

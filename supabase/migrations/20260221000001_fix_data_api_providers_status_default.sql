-- Align provider status default with data_api_providers_status_check.
alter table public.data_api_providers
  alter column status set default 'NotReady';

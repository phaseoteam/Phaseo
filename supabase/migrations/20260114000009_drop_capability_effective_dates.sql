-- Remove effective_from/effective_to from provider model capabilities.
alter table if exists public.data_api_provider_model_capabilities
  drop column if exists effective_from,
  drop column if exists effective_to;

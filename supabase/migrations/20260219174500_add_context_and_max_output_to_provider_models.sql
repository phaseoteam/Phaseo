alter table public.data_api_provider_models
    add column if not exists context_length integer;

alter table public.data_api_provider_models
    add column if not exists max_output_tokens integer;


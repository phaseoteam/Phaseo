-- Remove legacy non-prefixed pricing tables now replaced by data_api_*.

drop table if exists public.api_pricing_conditions;
drop table if exists public.api_pricing_rules;
drop table if exists public.api_provider_model_capabilities;
drop table if exists public.api_model_aliases;
drop table if exists public.api_provider_models;

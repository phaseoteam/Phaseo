-- Optimize resolver hot-path lookups used by public model routes.
-- These indexes target repeated filters on api_model_id/model_id and provider_id.

create index if not exists data_api_provider_models_api_provider_model_id_idx
  on public.data_api_provider_models (api_model_id, provider_id, model_id)
  where model_id is not null;

create index if not exists data_api_provider_models_model_api_idx
  on public.data_api_provider_models (model_id, api_model_id)
  where api_model_id is not null;

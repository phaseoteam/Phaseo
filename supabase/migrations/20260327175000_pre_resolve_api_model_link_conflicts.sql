-- Pre-resolve legacy internal_model_id -> api_model_id ambiguity
-- so 20260327180000_link_internal_models_to_api_model_ids.sql can proceed.
--
-- Strategy:
-- 1) For each internal_model_id, choose one canonical api_model_id using
--    the same ranking policy used in the link migration.
-- 2) For rows where api_model_id differs from the chosen canonical value,
--    clear internal_model_id to avoid creating multi-candidate conflicts.

with ranked as (
  select
    pm.provider_api_model_id,
    btrim(pm.internal_model_id) as internal_model_id,
    btrim(pm.api_model_id) as api_model_id,
    first_value(btrim(pm.api_model_id)) over (
      partition by btrim(pm.internal_model_id)
      order by
        pm.is_active_gateway desc,
        pm.effective_from desc nulls last,
        pm.updated_at desc nulls last,
        btrim(pm.api_model_id) asc
    ) as chosen_api_model_id
  from public.data_api_provider_models pm
  where pm.internal_model_id is not null
    and btrim(pm.internal_model_id) <> ''
    and pm.api_model_id is not null
    and btrim(pm.api_model_id) <> ''
)
update public.data_api_provider_models pm
set internal_model_id = null
from ranked r
where pm.provider_api_model_id = r.provider_api_model_id
  and r.api_model_id is distinct from r.chosen_api_model_id
  and pm.internal_model_id is not null;

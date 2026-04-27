create or replace function public.resolve_public_model_id(
  p_model_id text,
  p_provider text default null
)
returns text
language sql
stable
as $$
with direct_match as (
  select dm.model_id as canonical_model_id
  from public.data_models dm
  where dm.model_id = p_model_id
  limit 1
),
alias_match as (
  select a.api_model_id as canonical_model_id
  from public.data_api_model_aliases a
  where a.alias_slug = p_model_id
    and coalesce(a.is_enabled, true)
  limit 1
),
provider_match as (
  select coalesce(nullif(pm.model_id, ''), pm.api_model_id) as canonical_model_id,
         pm.is_active_gateway,
         pm.updated_at
  from public.data_api_provider_models pm
  where (p_provider is null or pm.provider_id = p_provider)
    and (
      pm.model_id = p_model_id
      or pm.api_model_id = p_model_id
      or pm.provider_api_model_id = p_model_id
      or pm.provider_model_slug = p_model_id
    )
  order by pm.is_active_gateway desc, pm.updated_at desc nulls last
  limit 1
)
select canonical_model_id
from (
  select 0 as ord, canonical_model_id from direct_match
  union all
  select 1 as ord, canonical_model_id from alias_match
  union all
  select 2 as ord, canonical_model_id from provider_match
) candidates
where canonical_model_id is not null
  and btrim(canonical_model_id) <> ''
order by ord
limit 1;
$$;

comment on function public.resolve_public_model_id(text, text)
  is 'Resolves canonical public model ids from canonical ids, aliases, and provider-facing model identifiers only.';

drop table if exists public.data_model_id_redirects;

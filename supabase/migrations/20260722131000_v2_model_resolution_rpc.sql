create or replace function public.get_v2_model_resolution(p_requested_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with requested as (select lower(trim(p_requested_slug)) as slug),
  direct as (
    select model.model_slug
    from public.v2_models model, requested
    where model.model_slug = requested.slug
      and model.hidden = false and model.status <> 'disabled'
    limit 1
  ),
  alias as (
    select alias.model_slug
    from public.v2_model_aliases alias, requested
    where alias.alias_slug = requested.slug and alias.enabled = true
      and (alias.effective_from is null or alias.effective_from <= now())
      and (alias.effective_to is null or alias.effective_to > now())
    limit 1
  ),
  route as (
    select route.model_slug
    from public.v2_model_provider_routes route, requested
    where route.provider_model_id = requested.slug
       or route.provider_model_slug = requested.slug
    order by route.status = 'active' desc, route.provider_model_id
    limit 1
  )
  select jsonb_build_object(
    'requestedModelId', p_requested_slug,
    'canonicalModelId', coalesce((select model_slug from direct), (select model_slug from alias), (select model_slug from route)),
    'internalModelId', coalesce((select model_slug from direct), (select model_slug from alias), (select model_slug from route)),
    'source', case
      when exists (select 1 from direct) then 'direct'
      when exists (select 1 from alias) then 'alias'
      when exists (select 1 from route) then 'provider_mapping'
      else 'unresolved'
    end
  );
$$;

grant execute on function public.get_v2_model_resolution(text) to anon, authenticated, service_role;

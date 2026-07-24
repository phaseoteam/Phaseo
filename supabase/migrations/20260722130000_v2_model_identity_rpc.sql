alter table public.v2_models add column if not exists previous_model_slug text;
alter table public.v2_models add column if not exists removal_date timestamptz;
alter table public.v2_models add column if not exists replacement_model_slug text;

create index if not exists v2_models_previous_idx
  on public.v2_models (previous_model_slug)
  where previous_model_slug is not null;

create or replace function public.get_v2_model_identity(p_model_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'model_slug', model.model_slug,
    'name', model.name,
    'description', model.description,
    'status', model.status,
    'hidden', model.hidden,
    'previous_model_slug', model.previous_model_slug,
    'replacement_model_slug', model.replacement_model_slug,
    'announced_at', model.announced_at,
    'released_at', model.released_at,
    'deprecated_at', model.deprecated_at,
    'retired_at', model.retired_at,
    'removal_date', model.removal_date,
    'family_slug', model.family_slug,
    'license', model.license,
    'license_url', model.license_url,
    'lab_slug', lab.lab_slug,
    'lab_name', lab.name,
    'lab_country_code', lab.country_code
  )
  from public.v2_models model
  join public.v2_labs lab on lab.lab_slug = model.lab_slug
  where model.model_slug = lower(trim(p_model_slug))
    and model.hidden = false
    and model.status <> 'disabled';
$$;

grant execute on function public.get_v2_model_identity(text) to anon, authenticated, service_role;

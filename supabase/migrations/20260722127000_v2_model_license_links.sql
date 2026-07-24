-- Keep the human-readable license and its authoritative URL first-class on the
-- canonical model row. The URL is intentionally nullable: a license name
-- without a verifiable source must not be guessed.
alter table public.v2_models add column if not exists license text;
alter table public.v2_models add column if not exists license_url text;

create index if not exists v2_models_license_idx
  on public.v2_models (license)
  where license is not null;

create or replace function public.get_v2_model_license(p_model_slug text)
returns table (
  model_slug text,
  license text,
  license_url text
)
language sql
stable
security invoker
set search_path = public
as $$
  select model.model_slug, model.license, model.license_url
  from public.v2_models model
  where model.model_slug = lower(trim(p_model_slug))
    and model.hidden = false
    and model.status <> 'disabled';
$$;

grant execute on function public.get_v2_model_license(text) to anon, authenticated, service_role;
comment on column public.v2_models.license_url is 'Authoritative URL for the model licence text or terms; nullable when not verified.';

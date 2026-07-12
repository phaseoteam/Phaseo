-- Give every app a stable, human-readable identifier for public URLs.
-- UUIDs remain the internal primary key and legacy route identifier.

alter table public.api_apps
  add column if not exists slug text;

create or replace function public.api_app_slug_base(
  p_title text,
  p_id uuid
)
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'app-' || left(p_id::text, 8)
  );
$$;

create or replace function public.assign_api_app_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
begin
  if new.slug is not null and btrim(new.slug) <> '' then
    new.slug := lower(btrim(new.slug));
    return new;
  end if;

  base_slug := left(public.api_app_slug_base(new.title, new.id), 55);
  perform pg_advisory_xact_lock(hashtextextended(base_slug, 0));

  candidate_slug := base_slug;
  while exists (
    select 1
    from public.api_apps app
    where app.slug = candidate_slug
      and app.id is distinct from new.id
  ) loop
    suffix := suffix + 1;
    candidate_slug := left(base_slug, 64 - length(suffix::text) - 1) || '-' || suffix;
  end loop;

  new.slug := candidate_slug;
  return new;
end;
$$;

drop trigger if exists assign_api_app_slug on public.api_apps;
create trigger assign_api_app_slug
  before insert or update of slug on public.api_apps
  for each row
  when (new.slug is null or btrim(new.slug) = '')
  execute function public.assign_api_app_slug();

-- Backfill existing rows through the same collision-safe assignment path.
update public.api_apps
set slug = null
where slug is null or btrim(slug) = '';

create unique index if not exists api_apps_slug_key
  on public.api_apps (slug);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'api_apps_slug_format_check'
      and conrelid = 'public.api_apps'::regclass
  ) then
    alter table public.api_apps
      add constraint api_apps_slug_format_check
      check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;
end $$;

alter table public.api_apps
  alter column slug set not null;

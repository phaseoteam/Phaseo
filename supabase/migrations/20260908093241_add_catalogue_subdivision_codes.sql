-- phaseo:allow-production-history-backfill -- Restore a migration already applied to production outside this checkout.
-- Store the primary catalogue location at ISO 3166-2 subdivision precision.
-- country_code remains the ISO 3166-1 alpha-2 country used by existing country
-- pages and aggregations; subdivision_code is nullable because some records
-- only have a verified country-level location.

alter table public.v2_labs
  add column if not exists subdivision_code text;

alter table public.v2_providers
  add column if not exists subdivision_code text;

alter table public.v2_labs
  drop constraint if exists v2_labs_subdivision_code_check;

alter table public.v2_labs
  add constraint v2_labs_subdivision_code_check check (
    subdivision_code is null
    or (
      subdivision_code = upper(btrim(subdivision_code))
      and subdivision_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'
      and (
        lower(btrim(country_code)) = 'xx'
        or split_part(subdivision_code, '-', 1) = upper(btrim(country_code))
      )
    )
  );

alter table public.v2_providers
  drop constraint if exists v2_providers_subdivision_code_check;

alter table public.v2_providers
  add constraint v2_providers_subdivision_code_check check (
    subdivision_code is null
    or (
      subdivision_code = upper(btrim(subdivision_code))
      and subdivision_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'
      and (
        lower(btrim(country_code)) = 'xx'
        or split_part(subdivision_code, '-', 1) = upper(btrim(country_code))
      )
    )
  );

create index if not exists v2_labs_subdivision_idx
  on public.v2_labs (subdivision_code)
  where subdivision_code is not null;

create index if not exists v2_providers_subdivision_idx
  on public.v2_providers (subdivision_code)
  where subdivision_code is not null;

comment on column public.v2_labs.subdivision_code is
  'Primary organisation location as an ISO 3166-2 subdivision code, for example US-CA.';

comment on column public.v2_providers.subdivision_code is
  'Primary provider location as an ISO 3166-2 subdivision code, for example US-CA.';

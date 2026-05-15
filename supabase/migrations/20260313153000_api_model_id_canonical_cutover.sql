-- API-first model identity cutover
-- Canonical public model identity is now API model ID.

-- 1) Provider mapping table: add canonical FK column (model_id) and backfill from api_model_id.
alter table public.data_api_provider_models
  add column if not exists model_id text;
update public.data_api_provider_models
set model_id = api_model_id
where api_model_id is not null
  and btrim(api_model_id) <> ''
  and (model_id is null or model_id <> api_model_id);
create index if not exists data_api_provider_models_model_id_idx
  on public.data_api_provider_models(model_id);
-- 2) Legacy URL compatibility map: old internal model id -> canonical api model id.
create table if not exists public.data_model_id_redirects (
  legacy_model_id text primary key,
  model_id text not null,
  source text not null default 'provider_mapping',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists data_model_id_redirects_model_id_idx
  on public.data_model_id_redirects(model_id);
with ranked_redirect_targets as (
  select
    pm.internal_model_id as legacy_model_id,
    pm.api_model_id as model_id,
    row_number() over (
      partition by pm.internal_model_id
      order by
        pm.is_active_gateway desc,
        pm.effective_from desc nulls last,
        pm.updated_at desc nulls last,
        pm.api_model_id asc
    ) as rn
  from public.data_api_provider_models pm
  where pm.internal_model_id is not null
    and btrim(pm.internal_model_id) <> ''
    and pm.api_model_id is not null
    and btrim(pm.api_model_id) <> ''
    and pm.internal_model_id <> pm.api_model_id
)
insert into public.data_model_id_redirects (legacy_model_id, model_id, source)
select
  rr.legacy_model_id,
  rr.model_id,
  'provider_mapping' as source
from ranked_redirect_targets rr
where rr.rn = 1
on conflict (legacy_model_id) do update
set model_id = excluded.model_id,
    source = excluded.source,
    updated_at = now();
-- 3) Ensure canonical data_models rows exist for each API model id in provider mappings.
with inferred_org_ids as (
  select distinct
    lower(split_part(pm.api_model_id, '/', 1)) as organisation_id
  from public.data_api_provider_models pm
  where pm.api_model_id is not null
    and btrim(pm.api_model_id) <> ''
),
missing_orgs as (
  select io.organisation_id
  from inferred_org_ids io
  left join public.data_organisations org
    on lower(org.organisation_id) = io.organisation_id
  where io.organisation_id is not null
    and btrim(io.organisation_id) <> ''
    and org.organisation_id is null
)
insert into public.data_organisations (
  organisation_id,
  name,
  country_code,
  description
)
select
  mo.organisation_id,
  '[Auto] ' || mo.organisation_id as name,
  'XX' as country_code,
  'Auto-created during canonical API model backfill.' as description
from missing_orgs mo
on conflict (organisation_id) do nothing;
with canonical_candidates as (
  select distinct on (pm.api_model_id)
    pm.api_model_id,
    pm.internal_model_id
  from public.data_api_provider_models pm
  where pm.api_model_id is not null
    and btrim(pm.api_model_id) <> ''
  order by
    pm.api_model_id,
    case when pm.internal_model_id is null then 1 else 0 end,
    pm.updated_at desc nulls last
),
resolved as (
  select
    c.api_model_id as model_id,
    legacy.model_id as legacy_model_id,
    coalesce(
      legacy.name,
      nullif(initcap(replace(split_part(c.api_model_id, '/', 2), '-', ' ')), ''),
      c.api_model_id
    ) as name,
    coalesce(legacy.organisation_id, org_guess.organisation_id) as organisation_id,
    legacy.status,
    legacy.announcement_date,
    legacy.release_date,
    legacy.deprecation_date,
    legacy.retirement_date,
    legacy.license,
    legacy.input_types,
    legacy.output_types,
    legacy.previous_model_id,
    legacy.family_id,
    legacy.timeline,
    coalesce(legacy.hidden, false) as hidden
  from canonical_candidates c
  left join public.data_models legacy
    on legacy.model_id = c.internal_model_id
  left join lateral (
    select o.organisation_id
    from public.data_organisations o
    where lower(o.organisation_id) = lower(split_part(c.api_model_id, '/', 1))
    limit 1
  ) org_guess on true
)
insert into public.data_models (
  model_id,
  name,
  organisation_id,
  status,
  announcement_date,
  release_date,
  deprecation_date,
  retirement_date,
  license,
  input_types,
  output_types,
  previous_model_id,
  family_id,
  timeline,
  hidden
)
select
  r.model_id,
  r.name,
  r.organisation_id,
  r.status,
  r.announcement_date,
  r.release_date,
  r.deprecation_date,
  r.retirement_date,
  r.license,
  r.input_types,
  r.output_types,
  r.previous_model_id,
  r.family_id,
  r.timeline,
  r.hidden
from resolved r
left join public.data_models existing
  on existing.model_id = r.model_id
where existing.model_id is null
  and r.organisation_id is not null;
-- 4) Copy key model child metadata from legacy ids to canonical ids.
with legacy_to_canonical as (
  select distinct
    pm.internal_model_id as legacy_model_id,
    pm.api_model_id as model_id
  from public.data_api_provider_models pm
  where pm.internal_model_id is not null
    and btrim(pm.internal_model_id) <> ''
    and pm.api_model_id is not null
    and btrim(pm.api_model_id) <> ''
    and pm.internal_model_id <> pm.api_model_id
)
insert into public.data_model_details (model_id, detail_name, detail_value)
select
  mapping.model_id,
  details.detail_name,
  details.detail_value
from legacy_to_canonical mapping
join public.data_models canonical
  on canonical.model_id = mapping.model_id
join public.data_model_details details
  on details.model_id = mapping.legacy_model_id
where not exists (
  select 1
  from public.data_model_details existing
  where existing.model_id = mapping.model_id
    and existing.detail_name = details.detail_name
    and coalesce(existing.detail_value::text, '') = coalesce(details.detail_value::text, '')
);
with legacy_to_canonical as (
  select distinct
    pm.internal_model_id as legacy_model_id,
    pm.api_model_id as model_id
  from public.data_api_provider_models pm
  where pm.internal_model_id is not null
    and btrim(pm.internal_model_id) <> ''
    and pm.api_model_id is not null
    and btrim(pm.api_model_id) <> ''
    and pm.internal_model_id <> pm.api_model_id
)
insert into public.data_model_links (model_id, url, platform)
select
  mapping.model_id,
  links.url,
  links.platform
from legacy_to_canonical mapping
join public.data_models canonical
  on canonical.model_id = mapping.model_id
join public.data_model_links links
  on links.model_id = mapping.legacy_model_id
where not exists (
  select 1
  from public.data_model_links existing
  where existing.model_id = mapping.model_id
    and existing.url = links.url
    and coalesce(existing.platform, '') = coalesce(links.platform, '')
);
with legacy_to_canonical as (
  select distinct
    pm.internal_model_id as legacy_model_id,
    pm.api_model_id as model_id
  from public.data_api_provider_models pm
  where pm.internal_model_id is not null
    and btrim(pm.internal_model_id) <> ''
    and pm.api_model_id is not null
    and btrim(pm.api_model_id) <> ''
    and pm.internal_model_id <> pm.api_model_id
)
insert into public.data_benchmark_results (
  benchmark_id,
  model_id,
  score,
  is_self_reported,
  other_info,
  source_link,
  rank
)
select
  br.benchmark_id,
  mapping.model_id,
  br.score,
  br.is_self_reported,
  br.other_info,
  br.source_link,
  br.rank
from legacy_to_canonical mapping
join public.data_models canonical
  on canonical.model_id = mapping.model_id
join public.data_benchmark_results br
  on br.model_id = mapping.legacy_model_id
where not exists (
  select 1
  from public.data_benchmark_results existing
  where existing.model_id = mapping.model_id
    and existing.benchmark_id = br.benchmark_id
    and coalesce(existing.score::text, '') = coalesce(br.score::text, '')
    and coalesce(existing.rank, -1) = coalesce(br.rank, -1)
    and coalesce(existing.source_link, '') = coalesce(br.source_link, '')
    and coalesce(existing.other_info, '') = coalesce(br.other_info, '')
    and coalesce(existing.is_self_reported, false) = coalesce(br.is_self_reported, false)
);
-- Remap previous_model_id edges if they still point to legacy ids.
update public.data_models dm
set previous_model_id = redirects.model_id,
    updated_at = now()
from public.data_model_id_redirects redirects
where dm.previous_model_id = redirects.legacy_model_id
  and dm.model_id <> redirects.model_id;
-- 5) Keep provider mapping canonical column synced.
create or replace function public.sync_data_api_provider_models_model_id()
returns trigger
language plpgsql
as $$
begin
  if new.api_model_id is not null and btrim(new.api_model_id) <> '' then
    new.model_id := new.api_model_id;
  elsif (new.model_id is null or btrim(new.model_id) = '')
    and new.internal_model_id is not null
    and btrim(new.internal_model_id) <> '' then
    select r.model_id
      into new.model_id
    from public.data_model_id_redirects r
    where r.legacy_model_id = new.internal_model_id
    limit 1;
  end if;

  return new;
end;
$$;
drop trigger if exists data_api_provider_models_sync_model_id_trigger
  on public.data_api_provider_models;
create trigger data_api_provider_models_sync_model_id_trigger
before insert or update of api_model_id, internal_model_id, model_id
on public.data_api_provider_models
for each row
execute function public.sync_data_api_provider_models_model_id();
-- 6) Add canonical FK from provider mappings to data_models.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'data_api_provider_models_model_id_fkey'
      and conrelid = 'public.data_api_provider_models'::regclass
  ) and not exists (
    select 1
    from public.data_api_provider_models pm
    left join public.data_models dm
      on dm.model_id = pm.model_id
    where pm.model_id is not null
      and btrim(pm.model_id) <> ''
      and dm.model_id is null
  ) then
    alter table public.data_api_provider_models
      add constraint data_api_provider_models_model_id_fkey
      foreign key (model_id)
      references public.data_models(model_id)
      on update cascade
      on delete set null;
  elsif not exists (
    select 1
    from pg_constraint
    where conname = 'data_api_provider_models_model_id_fkey'
      and conrelid = 'public.data_api_provider_models'::regclass
  ) then
    raise notice 'Skipping data_api_provider_models_model_id_fkey creation due unresolved provider model_id rows.';
  end if;
end
$$;
-- 7) Final provider-row backfill using redirect mapping for legacy-only rows.
update public.data_api_provider_models pm
set model_id = redirects.model_id
from public.data_model_id_redirects redirects
where (pm.model_id is null or btrim(pm.model_id) = '')
  and pm.internal_model_id = redirects.legacy_model_id;

-- Keep internal data_models.model_id as canonical identity.
-- Add an explicit 1:many-safe link from internal model IDs to provider-facing api_model_id.
-- This migration intentionally avoids API-ID hard cutover.

alter table public.data_models
  add column if not exists api_model_id text;
create index if not exists data_models_api_model_id_idx
  on public.data_models(api_model_id);
create table if not exists public.data_model_api_id_link_conflicts (
  conflict_id bigint generated always as identity primary key,
  internal_model_id text not null,
  candidate_api_model_ids text[] not null,
  created_at timestamptz not null default now()
);
truncate table public.data_model_api_id_link_conflicts;
with provider_candidates as (
  select
    btrim(pm.internal_model_id) as internal_model_id,
    btrim(pm.api_model_id) as api_model_id
  from public.data_api_provider_models pm
  where pm.internal_model_id is not null
    and btrim(pm.internal_model_id) <> ''
    and pm.api_model_id is not null
    and btrim(pm.api_model_id) <> ''
),
conflicts as (
  select
    c.internal_model_id,
    array_agg(distinct c.api_model_id order by c.api_model_id) as candidate_api_model_ids
  from provider_candidates c
  group by c.internal_model_id
  having count(distinct c.api_model_id) > 1
)
insert into public.data_model_api_id_link_conflicts (internal_model_id, candidate_api_model_ids)
select
  c.internal_model_id,
  c.candidate_api_model_ids
from conflicts c;
do $$
declare
  conflict_count integer;
begin
  select count(*) into conflict_count
  from public.data_model_api_id_link_conflicts;

  if conflict_count > 0 then
    raise exception
      'Model->api_model_id linking blocked. Resolve rows in public.data_model_api_id_link_conflicts (% conflicts).',
      conflict_count;
  end if;
end
$$;
with ranked_mapping as (
  select
    btrim(pm.internal_model_id) as internal_model_id,
    btrim(pm.api_model_id) as api_model_id,
    row_number() over (
      partition by btrim(pm.internal_model_id)
      order by
        pm.is_active_gateway desc,
        pm.effective_from desc nulls last,
        pm.updated_at desc nulls last,
        btrim(pm.api_model_id) asc
    ) as rn
  from public.data_api_provider_models pm
  where pm.internal_model_id is not null
    and btrim(pm.internal_model_id) <> ''
    and pm.api_model_id is not null
    and btrim(pm.api_model_id) <> ''
),
chosen as (
  select
    rm.internal_model_id,
    rm.api_model_id
  from ranked_mapping rm
  where rm.rn = 1
)
update public.data_models dm
set api_model_id = c.api_model_id
from chosen c
where dm.model_id = c.internal_model_id
  and dm.api_model_id is distinct from c.api_model_id;
-- Recompute provider model bridge FK (model_id) from:
-- 1) internal_model_id if it exists in data_models
-- 2) data_models.api_model_id lookup
-- 3) direct api_model_id match in data_models
with resolved as (
  select
    pm.provider_api_model_id,
    coalesce(
      (
        select dm.model_id
        from public.data_models dm
        where dm.model_id = pm.internal_model_id
        limit 1
      ),
      (
        select dm.model_id
        from public.data_models dm
        where dm.api_model_id = pm.api_model_id
        order by dm.model_id
        limit 1
      ),
      (
        select dm.model_id
        from public.data_models dm
        where dm.model_id = pm.api_model_id
        limit 1
      )
    ) as resolved_model_id
  from public.data_api_provider_models pm
)
update public.data_api_provider_models pm
set model_id = r.resolved_model_id
from resolved r
where pm.provider_api_model_id = r.provider_api_model_id
  and pm.model_id is distinct from r.resolved_model_id;
create or replace function public.sync_data_api_provider_models_model_id()
returns trigger
language plpgsql
as $$
begin
  -- Respect explicitly provided valid model_id.
  if new.model_id is not null
    and btrim(new.model_id) <> ''
    and exists (
      select 1
      from public.data_models dm
      where dm.model_id = new.model_id
    )
  then
    return new;
  end if;

  -- Preferred bridge: internal model identity.
  if new.internal_model_id is not null
    and btrim(new.internal_model_id) <> ''
    and exists (
      select 1
      from public.data_models dm
      where dm.model_id = new.internal_model_id
    )
  then
    new.model_id := new.internal_model_id;
    return new;
  end if;

  -- Secondary bridge: data_models.api_model_id mapping.
  if new.api_model_id is not null and btrim(new.api_model_id) <> '' then
    select dm.model_id
      into new.model_id
    from public.data_models dm
    where dm.api_model_id = new.api_model_id
    order by dm.model_id
    limit 1;

    if new.model_id is not null and btrim(new.model_id) <> '' then
      return new;
    end if;
  end if;

  -- Compatibility fallback: when api_model_id is itself a model_id.
  if new.api_model_id is not null
    and btrim(new.api_model_id) <> ''
    and exists (
      select 1
      from public.data_models dm
      where dm.model_id = new.api_model_id
    )
  then
    new.model_id := new.api_model_id;
    return new;
  end if;

  -- Leave null if unresolved to avoid invalid FK references.
  new.model_id := null;
  return new;
end;
$$;

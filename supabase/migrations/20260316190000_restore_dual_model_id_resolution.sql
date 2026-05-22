-- Restore dual-ID resolution for provider model mappings.
-- We keep both:
-- - api_model_id: canonical provider-facing identifier
-- - internal_model_id: internal release/version identifier
--
-- model_id is the FK bridge used by data_api_provider_models -> data_models.
-- Prefer internal_model_id when it exists in data_models, otherwise fall back
-- to api_model_id when it exists in data_models. If neither resolves, keep null.

create or replace function public.sync_data_api_provider_models_model_id()
returns trigger
language plpgsql
as $$
begin
  -- Respect an explicitly provided model_id only if it is valid.
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

  -- Prefer internal_model_id to preserve internal release-version identity.
  if new.internal_model_id is not null and btrim(new.internal_model_id) <> '' then
    if exists (
      select 1
      from public.data_models dm
      where dm.model_id = new.internal_model_id
    ) then
      new.model_id := new.internal_model_id;
      return new;
    end if;

    -- Secondary fallback via redirect map for legacy internal ids.
    select r.model_id
      into new.model_id
    from public.data_model_id_redirects r
    where r.legacy_model_id = new.internal_model_id
    limit 1;

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
  end if;

  -- Fallback to api_model_id when it is materialized in data_models.
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

  -- If unresolved, keep null to avoid FK violations.
  new.model_id := null;
  return new;
end;
$$;
-- Backfill existing rows to align with dual-ID preference.
update public.data_api_provider_models pm
set model_id = pm.internal_model_id,
    updated_at = now()
where pm.internal_model_id is not null
  and btrim(pm.internal_model_id) <> ''
  and exists (
    select 1
    from public.data_models dm
    where dm.model_id = pm.internal_model_id
  )
  and pm.model_id is distinct from pm.internal_model_id;
-- For unresolved rows, try api_model_id only when materialized in data_models.
update public.data_api_provider_models pm
set model_id = pm.api_model_id,
    updated_at = now()
where (pm.model_id is null or btrim(pm.model_id) = '')
  and pm.api_model_id is not null
  and btrim(pm.api_model_id) <> ''
  and exists (
    select 1
    from public.data_models dm
    where dm.model_id = pm.api_model_id
  );
-- Safety cleanup: if any stale model_id slipped through, null it out.
update public.data_api_provider_models pm
set model_id = null,
    updated_at = now()
where pm.model_id is not null
  and btrim(pm.model_id) <> ''
  and not exists (
    select 1
    from public.data_models dm
    where dm.model_id = pm.model_id
  );

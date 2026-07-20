-- Compare and persist model discovery snapshots inside Postgres so the Worker
-- does not need to download the complete seen-model table.

create or replace function public.compare_model_discovery_snapshot(
  p_provider_ids text[],
  p_snapshot_provider_ids text[],
  p_current_models jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with current_models as (
    select
      model.provider_id,
      model.model_id,
      coalesce(model.model_details, '{}'::jsonb) as model_details,
      model.pricing_details
    from jsonb_to_recordset(coalesce(p_current_models, '[]'::jsonb)) as model(
      provider_id text,
      model_id text,
      model_details jsonb,
      pricing_details jsonb
    )
    where model.provider_id = any(coalesce(p_provider_ids, array[]::text[]))
  ),
  providers as (
    select distinct provider_id
    from unnest(coalesce(p_provider_ids, array[]::text[])) as provider_id
  ),
  existing_models as (
    select seen.provider_id, seen.model_id, seen.model_details, seen.pricing_details
    from public.model_discovery_seen_models as seen
    join providers using (provider_id)
  ),
  provider_diffs as (
    select
      provider.provider_id,
      (select count(*) from existing_models old where old.provider_id = provider.provider_id) as previous_count,
      (select count(*) from current_models current where current.provider_id = provider.provider_id) as current_count,
      coalesce((
        select jsonb_agg(current.model_id order by current.model_id)
        from current_models current
        where current.provider_id = provider.provider_id
          and not exists (
            select 1 from existing_models old
            where old.provider_id = current.provider_id and old.model_id = current.model_id
          )
      ), '[]'::jsonb) as added,
      coalesce((
        select jsonb_agg(old.model_id order by old.model_id)
        from existing_models old
        where old.provider_id = provider.provider_id
          and not exists (
            select 1 from current_models current
            where current.provider_id = old.provider_id and current.model_id = old.model_id
          )
      ), '[]'::jsonb) as removed
    from providers provider
  ),
  changed_snapshots as (
    select old.provider_id, old.model_id, old.model_details, old.pricing_details
    from existing_models old
    join current_models current using (provider_id, model_id)
    where old.provider_id = any(coalesce(p_snapshot_provider_ids, array[]::text[]))
      and (
        old.model_details is distinct from current.model_details
        or old.pricing_details is distinct from current.pricing_details
      )
  ),
  snapshot_baselines as (
    select distinct old.provider_id
    from existing_models old
    where old.provider_id = any(coalesce(p_snapshot_provider_ids, array[]::text[]))
      and (old.pricing_details is not null or old.model_details <> '{}'::jsonb)
  )
  select jsonb_build_object(
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_id', provider_id,
        'previous_count', previous_count,
        'current_count', current_count,
        'added', added,
        'removed', removed
      ) order by provider_id)
      from provider_diffs
    ), '[]'::jsonb),
    'changed_snapshots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_id', provider_id,
        'model_id', model_id,
        'model_details', model_details,
        'pricing_details', pricing_details
      ) order by provider_id, model_id)
      from changed_snapshots
    ), '[]'::jsonb),
    'snapshot_baseline_provider_ids', coalesce((
      select jsonb_agg(provider_id order by provider_id) from snapshot_baselines
    ), '[]'::jsonb)
  );
$function$;
create or replace function public.commit_model_discovery_snapshot(
  p_run_id uuid,
  p_provider_ids text[],
  p_current_models jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  deleted_count integer := 0;
begin
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_current_models, '[]'::jsonb)) as model(provider_id text)
    where not (model.provider_id = any(coalesce(p_provider_ids, array[]::text[])))
  ) then
    raise exception 'Snapshot contains a provider outside p_provider_ids';
  end if;

  with current_models as (
    select model.provider_id, model.model_id
    from jsonb_to_recordset(coalesce(p_current_models, '[]'::jsonb)) as model(
      provider_id text,
      model_id text
    )
  ), deleted as (
    delete from public.model_discovery_seen_models seen
    where seen.provider_id = any(coalesce(p_provider_ids, array[]::text[]))
      and not exists (
        select 1 from current_models current
        where current.provider_id = seen.provider_id and current.model_id = seen.model_id
      )
    returning 1
  )
  select count(*) into deleted_count from deleted;

  insert into public.model_discovery_seen_models (
    provider_id,
    provider_name,
    model_id,
    model_details,
    pricing_details,
    last_seen_at,
    last_run_id
  )
  select
    model.provider_id,
    model.provider_name,
    model.model_id,
    coalesce(model.model_details, '{}'::jsonb),
    model.pricing_details,
    coalesce(model.last_seen_at, now()),
    p_run_id
  from jsonb_to_recordset(coalesce(p_current_models, '[]'::jsonb)) as model(
    provider_id text,
    provider_name text,
    model_id text,
    model_details jsonb,
    pricing_details jsonb,
    last_seen_at timestamptz
  )
  on conflict (provider_id, model_id) do update set
    provider_name = excluded.provider_name,
    model_details = excluded.model_details,
    pricing_details = excluded.pricing_details,
    last_seen_at = excluded.last_seen_at,
    last_run_id = excluded.last_run_id;

  return deleted_count;
end;
$function$;
revoke all on function public.compare_model_discovery_snapshot(text[], text[], jsonb) from public;
revoke all on function public.compare_model_discovery_snapshot(text[], text[], jsonb) from anon;
revoke all on function public.compare_model_discovery_snapshot(text[], text[], jsonb) from authenticated;
grant execute on function public.compare_model_discovery_snapshot(text[], text[], jsonb) to service_role;
revoke all on function public.commit_model_discovery_snapshot(uuid, text[], jsonb) from public;
revoke all on function public.commit_model_discovery_snapshot(uuid, text[], jsonb) from anon;
revoke all on function public.commit_model_discovery_snapshot(uuid, text[], jsonb) from authenticated;
grant execute on function public.commit_model_discovery_snapshot(uuid, text[], jsonb) to service_role;

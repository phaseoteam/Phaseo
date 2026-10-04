CREATE OR REPLACE FUNCTION public.confirm_model_discovery_issue_signals (
  p_run_id                  uuid,
  p_successful_provider_ids text[],
  p_entries                 jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  confirmed jsonb := '[]'::jsonb;
begin
  -- A returning model cancels its pending deletion signal.
  delete from public.model_discovery_issue_signals signal
  where signal.action = 'delete'
    and signal.provider_id = any(coalesce(p_successful_provider_ids, array[]::text[]))
    and exists (
      select 1
      from public.model_discovery_seen_models seen
      where seen.provider_id = signal.provider_id
        and seen.model_id = signal.model_id
    );

  -- Existing absent candidates have now survived another successful sweep.
  update public.model_discovery_issue_signals signal
  set
    consecutive_sweeps = signal.consecutive_sweeps + 1,
    last_observed_at = now(),
    last_observed_run_id = p_run_id
  where signal.action = 'delete'
    and signal.emitted_at is null
    and signal.provider_id = any(coalesce(p_successful_provider_ids, array[]::text[]))
    and signal.last_observed_run_id is distinct from p_run_id
    and not exists (
      select 1
      from public.model_discovery_seen_models seen
      where seen.provider_id = signal.provider_id
        and seen.model_id = signal.model_id
    );

  -- New deletion candidates begin at one observed sweep. Other actions are
  -- returned immediately and do not require confirmation.
  insert into public.model_discovery_issue_signals (
    source,
    provider_id,
    action,
    model_id,
    entry,
    consecutive_sweeps,
    first_observed_at,
    last_observed_at,
    last_observed_run_id
  )
  select
    raw.value ->> 'source',
    raw.value ->> 'providerId',
    raw.value ->> 'action',
    raw.value ->> 'modelId',
    raw.value,
    1,
    now(),
    now(),
    p_run_id
  from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) raw(value)
  where raw.value ->> 'action' = 'delete'
    and raw.value ->> 'providerId' = any(coalesce(p_successful_provider_ids, array[]::text[]))
  on conflict (source, provider_id, action, model_id) do update set
    entry = excluded.entry,
    last_observed_at = excluded.last_observed_at,
    last_observed_run_id = excluded.last_observed_run_id;

  with immediate_entries as (
    select value as entry
    from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb))
    where value ->> 'action' <> 'delete'
  ), confirmed_deletions as (
    select signal.entry
    from public.model_discovery_issue_signals signal
    where signal.action = 'delete'
      and signal.emitted_at is null
      and signal.consecutive_sweeps >= 2
      and signal.provider_id = any(coalesce(p_successful_provider_ids, array[]::text[]))
  ), all_confirmed as (
    select entry from immediate_entries
    union all
    select entry from confirmed_deletions
  )
  select coalesce(jsonb_agg(entry), '[]'::jsonb)
  into confirmed
  from all_confirmed;

  return confirmed;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."confirm_model_discovery_issue_signals"(uuid, text[], jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."confirm_model_discovery_issue_signals"(uuid, text[], jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."confirm_model_discovery_issue_signals"(uuid, text[], jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."confirm_model_discovery_issue_signals"(uuid, text[], jsonb) FROM PUBLIC, "anon", "authenticated";

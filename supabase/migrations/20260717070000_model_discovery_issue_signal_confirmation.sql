-- Persist deletion candidates so GitHub issues are only raised after the
-- model is absent from two consecutive successful provider sweeps.

create table if not exists public.model_discovery_issue_signals (
  source text not null,
  provider_id text not null,
  action text not null,
  model_id text not null,
  entry jsonb not null,
  consecutive_sweeps integer not null default 1,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  last_observed_run_id uuid,
  emitted_at timestamptz,
  constraint model_discovery_issue_signals_pkey primary key (source, provider_id, action, model_id),
  constraint model_discovery_issue_signals_action_check check (action = 'delete'),
  constraint model_discovery_issue_signals_consecutive_sweeps_check check (consecutive_sweeps > 0)
);
create index if not exists model_discovery_issue_signals_pending_idx
  on public.model_discovery_issue_signals (provider_id, emitted_at)
  where emitted_at is null;
create or replace function public.confirm_model_discovery_issue_signals(
  p_run_id uuid,
  p_successful_provider_ids text[],
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
create or replace function public.acknowledge_model_discovery_issue_signals(p_entries jsonb)
returns integer
language sql
security definer
set search_path = ''
as $function$
  with acknowledged as (
    update public.model_discovery_issue_signals signal
    set emitted_at = now()
    where signal.action = 'delete'
      and signal.emitted_at is null
      and exists (
        select 1
        from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) entry(value)
        where entry.value ->> 'source' = signal.source
          and entry.value ->> 'providerId' = signal.provider_id
          and entry.value ->> 'action' = signal.action
          and entry.value ->> 'modelId' = signal.model_id
      )
    returning 1
  )
  select count(*)::integer from acknowledged;
$function$;
revoke all on table public.model_discovery_issue_signals from anon, authenticated;
grant all on table public.model_discovery_issue_signals to service_role;
revoke all on function public.confirm_model_discovery_issue_signals(uuid, text[], jsonb) from public;
revoke all on function public.confirm_model_discovery_issue_signals(uuid, text[], jsonb) from anon;
revoke all on function public.confirm_model_discovery_issue_signals(uuid, text[], jsonb) from authenticated;
grant execute on function public.confirm_model_discovery_issue_signals(uuid, text[], jsonb) to service_role;
revoke all on function public.acknowledge_model_discovery_issue_signals(jsonb) from public;
revoke all on function public.acknowledge_model_discovery_issue_signals(jsonb) from anon;
revoke all on function public.acknowledge_model_discovery_issue_signals(jsonb) from authenticated;
grant execute on function public.acknowledge_model_discovery_issue_signals(jsonb) to service_role;

-- Prevent concurrent duplicate provider webhooks from entering finalization.

create or replace function public.gateway_claim_provider_event(
  p_provider text,
  p_provider_event_id text,
  p_worker_id text default 'batch-provider-webhook',
  p_lease_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed integer;
begin
  update public.gateway_provider_events event
  set replay_locked_at = now(),
      replay_locked_by = left(coalesce(nullif(trim(p_worker_id), ''), 'batch-provider-webhook'), 200),
      updated_at = now()
  where event.provider = nullif(trim(p_provider), '')
    and event.provider_event_id = nullif(trim(p_provider_event_id), '')
    and event.processed_at is null
    and event.dead_lettered_at is null
    and (event.next_attempt_at is null or event.next_attempt_at <= now())
    and (
      event.replay_locked_at is null
      or event.replay_locked_at < now() - make_interval(
        secs => greatest(30, least(coalesce(p_lease_seconds, 120), 3600))
      )
    );

  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$$;

revoke all on function public.gateway_claim_provider_event(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.gateway_claim_provider_event(text, text, text, integer)
  to service_role;

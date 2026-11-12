-- Restored from Phaseo Prod migration records; already applied as version 20261008102110.
-- phaseo:allow-production-history-backfill reason: Record the migration already applied to production from a local checkout so db push history matches.
-- phaseo:allow-destructive-migration reason: restored production record; the routing detail prune it defines is removed by 20261008154500
-- Routing pruning must not discard an in-flight or not-yet-written archive source.
create or replace function private.prune_routing_decision_details(p_batch_size integer default 500)
returns integer language plpgsql security definer
set search_path = '' set statement_timeout = '10s' set lock_timeout = '500ms'
as $function$
declare v_deleted integer;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 5000 then
    raise exception 'Routing detail prune batch size must be between 1 and 5000';
  end if;
  with candidates as (
    select decision.routing_decision_id
    from public.v2_request_routing_decisions decision
    where decision.created_at < now() - interval '7 days'
      and exists (
        select 1 from public.v2_request_facts fact
        join public.gateway_requests request
          on request.id = fact.gateway_request_id
          and request.created_at = fact.gateway_request_created_at
        where fact.request_event_id = decision.request_event_id
          and request.detail_metadata->'routing_archive'->>'version' = '1'
          and request.detail_metadata->'routing_archive'->>'sha256' ~ '^[a-f0-9]{64}$'
          and request.detail_metadata->'routing_archive'->>'key' =
            'workspaces/' || request.workspace_id::text || '/routing/v1/' ||
            encode(sha256(convert_to(request.request_id, 'UTF8')), 'hex') || '/' ||
            (request.detail_metadata->'routing_archive'->>'sha256') || '.json'
      )
    order by decision.created_at, decision.routing_decision_id
    limit p_batch_size for update of decision skip locked
  )
  delete from public.v2_request_routing_decisions decision using candidates
  where decision.routing_decision_id = candidates.routing_decision_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;
revoke all on function private.prune_routing_decision_details(integer) from public, anon, authenticated;
grant execute on function private.prune_routing_decision_details(integer) to service_role;
comment on function private.prune_routing_decision_details(integer) is
  'Prunes routing details older than seven days only after a committed archive reference exists. Unarchived details are retained until archive commit removes them.';

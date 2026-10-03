-- Current requests and former identities share the same configured batch cap.
-- Reserve five slots for former identities when present; use spare capacity
-- for repairs without increasing the total number of claimed batch rows.
set local lock_timeout='500ms';
set local statement_timeout='10s';
do $migration$
declare
  definition text := pg_get_functiondef('public.process_v2_analytics_outbox(integer)'::regprocedure);
  outbox_marker text := '  limit v_limit;';
  previous_marker text := '  order by previous.queued_at,previous.grain_id for update skip locked limit 1;';
begin
  if position(outbox_marker in definition)=0 or position(previous_marker in definition)=0 then
    raise exception 'Unexpected V2 analytics batch claim definitions';
  end if;
  definition := replace(definition,outbox_marker,
    '  limit case when exists(select 1 from private.v2_analytics_previous_grains)' || chr(10) ||
    '    then greatest(0,v_limit-least(5,v_limit)) else v_limit end;');
  definition := replace(definition,previous_marker,
    '  order by previous.queued_at,previous.grain_id for update skip locked limit greatest(0,v_limit-v_selected);');
  execute definition;
end;
$migration$;
comment on table private.v2_analytics_previous_grains is
  'Former UTC-hour identities coalesced by nullable dimensions; share the configured V2 worker batch cap, with five reserved repair slots and exact-generation acknowledgment. Retention pruning queues no repairs.';

-- Empty former groups must remain absent: public model/provider counts depend
-- on rollup row presence as well as request counters.
set local lock_timeout='500ms';
set local statement_timeout='10s';
do $migration$
declare
  definition text := pg_get_functiondef('public.process_v2_analytics_outbox(integer)'::regprocedure);
  marker text := '    returning rollup_id into v_rollup_id;';
begin
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>3 then
    raise exception 'Unexpected V2 private/daily/hourly aggregate insertion definitions';
  end if;
  execute replace(definition,marker,'    having count(*) > 0' || chr(10) || marker);
end;
$migration$;

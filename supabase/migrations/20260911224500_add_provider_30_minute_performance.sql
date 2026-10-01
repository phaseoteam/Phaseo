-- Serve the one-day performance view at 30-minute resolution while preserving
-- the same per-request percentile calculations as the hourly provider series.
do $migration$
declare
  function_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(
    'public.get_v2_model_provider_hourly_performance_v2(text,text,numeric,text,text)'::regprocedure
  ) into function_definition;

  updated_definition := replace(
    function_definition,
    'get_v2_model_provider_hourly_performance_v2',
    'get_v2_model_provider_30m_performance_v1'
  );
  updated_definition := replace(updated_definition, 'interval ''7 days''', 'interval ''1 day''');
  updated_definition := replace(
    updated_definition,
    'date_trunc(''hour'', fact.occurred_at)',
    'date_bin(interval ''30 minutes'', fact.occurred_at, timestamptz ''2001-01-01 00:00:00+00'')'
  );

  if updated_definition = function_definition
    or position('get_v2_model_provider_30m_performance_v1' in updated_definition) = 0
    or position('date_bin(interval ''30 minutes''' in updated_definition) = 0 then
    raise exception 'Could not derive the 30-minute provider performance RPC';
  end if;

  execute updated_definition;
end
$migration$;

revoke all on function public.get_v2_model_provider_30m_performance_v1(text, text, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.get_v2_model_provider_30m_performance_v1(text, text, numeric, text, text)
  to service_role;

comment on function public.get_v2_model_provider_30m_performance_v1(text, text, numeric, text, text) is
  'Thirty-minute provider performance percentiles for the trailing day, available from the first aggregated request.';

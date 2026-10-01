-- Keep seven-day provider latency metrics aligned with the dedicated hourly RPC.
-- The older daily query ignored the legacy TTFT column and omitted end-to-end
-- latency from its provider aggregation entirely.
do $migration$
declare
  function_definition text;
  updated_definition text;
begin
  select pg_get_functiondef(
    'public.get_v2_model_performance_metrics_unsuppressed(text,text,numeric,text,text)'::regprocedure
  ) into function_definition;

  updated_definition := replace(
    function_definition,
    'fact.success, fact.stream, fact.cloudflare_colo, fact.gateway_ttft_ms,',
    'fact.success, fact.stream, fact.cloudflare_colo,
    coalesce(fact.gateway_ttft_ms, fact.time_to_first_token_ms) gateway_ttft_ms,'
  );
  if updated_definition = function_definition then
    raise exception 'Expected the daily performance RPC TTFT projection';
  end if;
  function_definition := updated_definition;

  updated_definition := replace(
    function_definition,
    'filter (where success and gateway_ttft_ms is not null)::numeric gateway_ttft_ms,
    percentile_cont((select percentile from params)) within group (order by provider_duration_ms)
      filter (where success and provider_duration_ms is not null)::numeric provider_duration_ms,
    percentile_cont((select percentile from params)) within group (order by effective_throughput_tps)',
    'filter (where success and gateway_ttft_ms is not null)::numeric gateway_ttft_ms,
    percentile_cont((select percentile from params)) within group (order by gateway_e2e_ms)
      filter (where success and gateway_e2e_ms is not null)::numeric gateway_e2e_ms,
    percentile_cont((select percentile from params)) within group (order by provider_duration_ms)
      filter (where success and provider_duration_ms is not null)::numeric provider_duration_ms,
    percentile_cont((select percentile from params)) within group (order by effective_throughput_tps)'
  );
  if updated_definition = function_definition then
    raise exception 'Expected the daily provider percentile projection';
  end if;
  function_definition := updated_definition;

  updated_definition := replace(
    function_definition,
    '''gateway_ttft_ms'', gateway_ttft_ms, ''avg_latency_ms'', gateway_ttft_ms,
    ''provider_duration_ms'', provider_duration_ms, ''avg_generation_ms'', provider_duration_ms,
    ''effective_throughput_tps'', effective_throughput_tps, ''avg_throughput'', effective_throughput_tps,',
    '''gateway_ttft_ms'', gateway_ttft_ms, ''avg_latency_ms'', gateway_ttft_ms,
    ''gateway_e2e_ms'', gateway_e2e_ms,
    ''provider_duration_ms'', provider_duration_ms, ''avg_generation_ms'', provider_duration_ms,
    ''effective_throughput_tps'', effective_throughput_tps, ''avg_throughput'', effective_throughput_tps,'
  );
  if updated_definition = function_definition then
    raise exception 'Expected the daily provider JSON projection';
  end if;

  execute updated_definition;
end
$migration$;

comment on function public.get_v2_model_performance_metrics_unsuppressed(text, text, numeric, text, text) is
  'Unsuppressed model performance aggregates with TTFT fallback and end-to-end latency for hourly and daily provider series.';

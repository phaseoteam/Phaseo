CREATE OR REPLACE FUNCTION public.refresh_public_monitor_weekly_usage()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Readers keep the previous snapshot until this transaction commits.
  delete from public.public_monitor_weekly_usage;
  insert into public.public_monitor_weekly_usage
    (model_id, provider_id, total_tokens, throughput_sum, throughput_count,
     latency_sum, latency_count, refreshed_at)
  with weekly_request_groups as materialized (
    -- Resolve model aliases once per group, rather than once per request.
    -- Keep sums and counts separate so combining aliases preserves averages.
    select
      gr.canonical_model_id,
      gr.model_id,
      gr.provider,
      sum(public.gateway_usage_total_tokens(gr.usage)) as total_tokens,
      sum(gr.throughput::numeric) as throughput_sum,
      count(gr.throughput) as throughput_count,
      sum(gr.latency_ms::numeric) as latency_sum,
      count(gr.latency_ms) as latency_count
    from private.v2_rpc_gateway_requests_compat gr
    where gr.created_at >= now() - interval '7 days'
    group by gr.canonical_model_id, gr.model_id, gr.provider
  ),
  normalized_weekly_requests as (
    select
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.model_id, '')
      ) as canonical_model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      gr.total_tokens,
      gr.throughput_sum,
      gr.throughput_count,
      gr.latency_sum,
      gr.latency_count
    from weekly_request_groups gr
  )
  select
    r.canonical_model_id,
    r.provider_id,
    sum(r.total_tokens),
    sum(r.throughput_sum),
    sum(r.throughput_count),
    sum(r.latency_sum),
    sum(r.latency_count),
    now()
  from normalized_weekly_requests r
  where r.canonical_model_id is not null
  group by r.canonical_model_id, r.provider_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_public_monitor_weekly_usage"() TO "service_role";

COMMENT ON FUNCTION "public"."refresh_public_monitor_weekly_usage"() IS 'Replaces the rolling seven-day monitor usage snapshot from raw gateway requests. Runs from cron so public catalogue reads avoid the raw scan.';

REVOKE ALL ON FUNCTION "public"."refresh_public_monitor_weekly_usage"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_public_monitor_weekly_usage"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_public_monitor_weekly_usage"() FROM PUBLIC, "anon", "authenticated";

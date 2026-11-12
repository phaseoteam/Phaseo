CREATE OR REPLACE FUNCTION public.get_model_time_of_day_metrics (
  p_model_id text,
  p_days     integer DEFAULT 7
)
  RETURNS TABLE (
    hour                 integer,
    median_throughput    numeric,
    median_latency_ms    numeric,
    median_generation_ms numeric,
    samples              bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
	with windowed as (
		select
			date_part('hour', created_at at time zone 'UTC')::int as hour,
			throughput,
			latency_ms,
			generation_ms
		from gateway_requests
		where model_id = p_model_id
			and created_at >= timezone('UTC', now()) - (interval '1 day' * p_days)
	)
	select
		hour,
		percentile_cont(0.5) within group (order by throughput) as median_throughput,
		percentile_cont(0.5) within group (order by latency_ms) as median_latency_ms,
		percentile_cont(0.5) within group (order by generation_ms) as median_generation_ms,
		count(*) as samples
	from windowed
	group by hour
	order by hour;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_model_time_of_day_metrics"(text, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_model_time_of_day_metrics"(text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_model_time_of_day_metrics"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_model_time_of_day_metrics"(text, integer) TO "postgres";

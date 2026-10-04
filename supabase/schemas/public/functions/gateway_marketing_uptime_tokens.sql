CREATE OR REPLACE FUNCTION public.gateway_marketing_uptime_tokens (
  hours_window integer DEFAULT 24
)
  RETURNS TABLE (
    window_start    timestamp with time zone,
    window_end      timestamp with time zone,
    timeframe_hours integer,
    total_requests  bigint,
    uptime_pct      double precision,
    uptime_events   bigint,
    total_tokens    double precision
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
	with params as (
		select greatest(1, hours_window) as hours_window
	),
	bounds as (
		select
			now() at time zone 'utc' as window_end,
			(now() at time zone 'utc') - (p.hours_window || ' hours')::interval as window_start,
			p.hours_window
		from params p
	),
	scoped_requests as (
		select
			gr.success,
			gr.error_code,
			gr.usage,
			gr.created_at
		from gateway_requests gr
		cross join bounds b
		where gr.created_at >= b.window_start
			and gr.created_at < b.window_end
	)
	select
		b.window_start,
		b.window_end,
		b.hours_window as timeframe_hours,
		count(sr.*) as total_requests,
		case
			when count(sr.*) = 0 then null
			else round(
				(
					100.0 * count(*) filter (
						where coalesce(sr.success, false) or (sr.error_code ilike 'user:%')
					)::double precision
					/ greatest(count(sr.*), 1)::double precision
				)::numeric,
				4
			)::double precision
		end as uptime_pct,
		count(*) filter (
			where coalesce(sr.success, false) or (sr.error_code ilike 'user:%')
		) as uptime_events,
		coalesce(
			sum(
				case
					when jsonb_typeof(sr.usage -> 'total_tokens') = 'number' then
						(sr.usage ->> 'total_tokens')::double precision
					else 0::double precision
				end
			),
			0::double precision
		) as total_tokens
	from bounds b
	left join scoped_requests sr on true
	group by b.window_start, b.window_end, b.hours_window;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_marketing_uptime_tokens"(integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."gateway_marketing_uptime_tokens"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_marketing_uptime_tokens"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_marketing_uptime_tokens"(integer) TO "postgres";

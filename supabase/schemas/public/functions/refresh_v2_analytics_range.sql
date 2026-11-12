CREATE OR REPLACE FUNCTION public.refresh_v2_analytics_range (
  p_since        timestamp with time zone,
  p_until        timestamp with time zone DEFAULT now(),
  p_workspace_id uuid                     DEFAULT NULL::uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  result jsonb;
begin
  -- A synchronous refresh must own the processor before enqueueing its range.
  -- Otherwise an overlapping worker cannot see these uncommitted events, and
  -- its skipped result could be mistaken for a fully drained queue.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('public.process_v2_analytics_outbox', 0)) then
    raise exception 'Analytics processor is busy; retry the range refresh after it completes'
      using errcode = '55P03';
  end if;
  insert into public.v2_analytics_outbox (
    request_event_id, workspace_id, occurred_at, status,
    attempt_count, available_at, last_error, updated_at
  )
  select
    fact.request_event_id, fact.workspace_id, fact.occurred_at, 'pending',
    0, now(), null, now()
  from public.v2_request_facts fact
  where fact.occurred_at >= coalesce(p_since, '-infinity'::timestamptz)
    and fact.occurred_at < coalesce(p_until, 'infinity'::timestamptz)
    and (p_workspace_id is null or fact.workspace_id = p_workspace_id)
  on conflict (request_event_id) do update set
    status = 'pending',
    attempt_count = 0,
    available_at = now(),
    last_error = null,
    updated_at = now();

  loop
    result := public.process_v2_analytics_outbox(2000);
    exit when coalesce((result->>'selected')::integer, 0) = 0;
  end loop;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_v2_analytics_range"(timestamp WITH time zone, timestamp WITH time zone, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."refresh_v2_analytics_range"(timestamp with time zone, timestamp with time zone, uuid) IS 'Queues and recomputes V2 analytics grains for a bounded time/workspace range.';

REVOKE ALL ON FUNCTION "public"."refresh_v2_analytics_range"(timestamp WITH time zone, timestamp WITH time zone, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_v2_analytics_range"(timestamp WITH time zone, timestamp WITH time zone, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_v2_analytics_range"(timestamp WITH time zone, timestamp WITH time zone, uuid) FROM PUBLIC, "anon", "authenticated";

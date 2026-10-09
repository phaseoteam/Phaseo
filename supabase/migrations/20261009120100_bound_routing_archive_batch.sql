-- The backfill walks gateway_requests in id order. Requests created before
-- routing snapshots existed never match, so every batch rescanned the March-August
-- partitions (~24k of ~24.5k buffers per call on production, 2026-10-09).
-- Bounding created_at lets partition pruning skip them.
CREATE OR REPLACE FUNCTION public.gateway_routing_archive_batch(
  p_after_id uuid, p_after_created_at timestamptz, p_cutoff timestamptz, p_limit integer DEFAULT 25
)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
SET statement_timeout TO '5s'
AS $function$
  select public.gateway_routing_archive_source(candidate.id, candidate.created_at)
  from (
    select request.id, request.created_at
    from public.gateway_requests request
    where (request.id, request.created_at) > (p_after_id, p_after_created_at)
      -- Routing snapshots began on 2026-08-19. Older partitions hold only requests
      -- that can never qualify; without this bound every batch rescans all of them.
      and request.created_at >= timestamptz '2026-08-19 00:00:00+00'
      and request.created_at < least(p_cutoff, now() - interval '1 hour')
      and not coalesce(request.detail_metadata ? 'routing_archive', false)
      and (request.detail_metadata ? 'routing_snapshot' or exists (
        select 1 from public.v2_request_facts fact
        join public.v2_request_routing_decisions decision using (request_event_id)
        where fact.gateway_request_id = request.id and fact.gateway_request_created_at = request.created_at
      ))
    order by request.id, request.created_at
    limit greatest(1, least(p_limit, 100))
  ) candidate;
$function$;
REVOKE ALL ON FUNCTION public.gateway_routing_archive_batch(uuid, timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_routing_archive_batch(uuid, timestamptz, timestamptz, integer) TO service_role;

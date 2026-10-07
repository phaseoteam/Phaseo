CREATE OR REPLACE FUNCTION public.gateway_routing_archive_source(p_id uuid, p_created_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  with source as (
    select jsonb_build_object(
      'id', request.id, 'created_at', request.created_at,
      'workspace_id', request.workspace_id, 'request_id', request.request_id,
      'metadata', jsonb_build_object(
        'routing_snapshot', request.detail_metadata->'routing_snapshot',
        'routing_diagnostics', request.detail_metadata->'routing_diagnostics'
      ),
      'routing_trace', (select to_jsonb(trace) from public.v2_request_routing_traces trace
        where trace.request_event_id = fact.request_event_id),
      'routing_decisions', coalesce((select jsonb_agg(to_jsonb(routing_row) order by routing_row.decision_order)
        from public.v2_request_routing_decisions routing_row
        where routing_row.request_event_id = fact.request_event_id), '[]'::jsonb)
    ) payload
    from public.gateway_requests request
    left join public.v2_request_facts fact
      on fact.gateway_request_id = request.id and fact.gateway_request_created_at = request.created_at
    where request.id = p_id and request.created_at = p_created_at
      and not coalesce(request.detail_metadata ? 'routing_archive', false)
  )
  select payload || jsonb_build_object('source_hash', md5(payload::text)) from source;
$function$;
REVOKE ALL ON FUNCTION public.gateway_routing_archive_source(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_routing_archive_source(uuid, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.get_gateway_request_observability (
  p_workspace_id uuid,
  p_request_id   text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'request', to_jsonb(gateway_request),
    'fact', case when fact.request_event_id is null then null else to_jsonb(fact) end,
    'routing_trace', case when trace.request_event_id is null then null else to_jsonb(trace) end,
    'attempts', coalesce((select jsonb_agg(to_jsonb(attempt) order by attempt.attempt_number) from public.v2_request_attempts attempt where attempt.request_event_id = fact.request_event_id), '[]'::jsonb),
    'routing_decisions', coalesce((select jsonb_agg(to_jsonb(routing_decision) order by routing_decision.decision_order) from public.v2_request_routing_decisions routing_decision where routing_decision.request_event_id = fact.request_event_id), '[]'::jsonb),
    'usage_meters', coalesce((select jsonb_agg(to_jsonb(usage) order by usage.sequence, usage.meter_key) from public.v2_request_usage usage where usage.request_event_id = fact.request_event_id), '[]'::jsonb),
    'pricing_lines', coalesce((select jsonb_agg(to_jsonb(line) order by line.created_at, line.pricing_line_id) from public.v2_request_pricing_lines line where line.request_event_id = fact.request_event_id), '[]'::jsonb),
    'artifacts', coalesce((select jsonb_agg(to_jsonb(artifact) order by artifact.created_at, artifact.artifact_id) from public.v2_request_artifacts artifact where artifact.request_event_id = fact.request_event_id), '[]'::jsonb),
    'feedback', coalesce((select jsonb_agg(to_jsonb(feedback) order by feedback.created_at, feedback.feedback_id) from public.v2_request_feedback feedback where feedback.request_event_id = fact.request_event_id), '[]'::jsonb)
  )
  from public.gateway_requests gateway_request
  left join public.v2_request_facts fact
    on fact.gateway_request_id = gateway_request.id
   and fact.gateway_request_created_at = gateway_request.created_at
  left join public.v2_request_routing_traces trace
    on trace.request_event_id = fact.request_event_id
  where gateway_request.workspace_id = p_workspace_id
    and gateway_request.request_id = p_request_id
  order by gateway_request.created_at desc
  limit 1;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_gateway_request_observability"(uuid, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_request_observability"(uuid, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_gateway_request_observability"(uuid, text) IS 'Returns one authoritative gateway request enriched with normalized, metadata-only observability extensions.';

REVOKE ALL ON FUNCTION "public"."get_gateway_request_observability"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_request_observability"(uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_gateway_request_observability"(uuid, text) FROM PUBLIC, "anon";

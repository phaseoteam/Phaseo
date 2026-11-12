-- phaseo:allow-destructive-migration reason: drop empty, unreferenced v2 request-artifact/feedback and v2 credit tables
-- Drop four v2 side tables that were never written to.
--
-- public.v2_request_artifacts, public.v2_request_feedback, public.v2_credit_ledger and
-- public.v2_credit_reservations have 0 rows, 0 inserts and no inbound foreign keys, views,
-- cron jobs or REST traffic in production. No app code reads them. Live feedback is in
-- public.gateway_feedback and billing runs on public.credit_ledger and public.wallets.
--
-- get_gateway_request_observability was the only function that read two of them. It is
-- replaced first, because SQL function bodies are not dependency-tracked. Its 'artifacts'
-- and 'feedback' keys stay in the JSON and are always empty arrays, as they were in practice.
-- Grants and the comment on the function are kept by CREATE OR REPLACE.
--
-- Each table's policies, indexes and grants are dropped with it. No CASCADE is used.

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
    'artifacts', '[]'::jsonb,
    'feedback', '[]'::jsonb
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

DROP TABLE IF EXISTS public.v2_request_feedback;
DROP TABLE IF EXISTS public.v2_request_artifacts;
DROP TABLE IF EXISTS public.v2_credit_reservations;
DROP TABLE IF EXISTS public.v2_credit_ledger;

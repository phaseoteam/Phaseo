CREATE OR REPLACE FUNCTION public.gateway_realtime_review_evidence (
  p_session_id        text,
  p_expected_usage    jsonb,
  p_expected_metadata jsonb,
  p_cost_nanos        bigint,
  p_pricing_lines     jsonb,
  p_complete          boolean,
  p_error             text,
  p_billable_usage    jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_session public.gateway_realtime_sessions%rowtype;
begin
  select * into v_session from public.gateway_realtime_sessions where session_id = p_session_id for update;
  if not found or v_session.status <> 'billing_unresolved'
    or v_session.usage is distinct from p_expected_usage
    or v_session.metadata is distinct from p_expected_metadata then return false; end if;
  update public.gateway_realtime_billing_reviews set evidence_usage = p_expected_usage,
    evidence_metadata = p_expected_metadata, confirmed_cost_nanos = p_cost_nanos,
    billable_usage = p_billable_usage,
    pricing_lines = coalesce(p_pricing_lines, '[]'), evidence_complete = coalesce(p_complete, false),
    recovery_error = left(p_error, 200), attempts = attempts + 1, last_attempt_at = now(),
    retry_after = now() + interval '1 day', version = version + 1
  where session_id = p_session_id and status = 'open';
  return found;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_review_evidence"(text, jsonb, jsonb, bigint, jsonb, boolean, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_evidence"(text, jsonb, jsonb, bigint, jsonb, boolean, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_review_evidence"(text, jsonb, jsonb, bigint, jsonb, boolean, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_evidence"(text, jsonb, jsonb, bigint, jsonb, boolean, text, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_realtime_extend_hold_once (
  p_workspace_id          uuid,
  p_session_id            text,
  p_reservation_id        text,
  p_target_reserved_nanos bigint,
  p_estimated_cost_nanos  bigint DEFAULT 0
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_current_reserved_nanos bigint;
  v_additional_nanos bigint;
  v_budget_status jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  select reserved_nanos into v_current_reserved_nanos
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id;
  if not found then raise exception 'realtime_session_not_found'; end if;

  v_additional_nanos := greatest(0, coalesce(p_target_reserved_nanos, 0) - coalesce(v_current_reserved_nanos, 0));
  if v_additional_nanos > 0 then
    v_budget_status := public.gateway_workspace_budget_status(p_workspace_id, v_additional_nanos);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      raise exception '%', v_budget_status->>'reason';
    end if;
  end if;

  return query select * from public.gateway_realtime_extend_hold_once_without_workspace_budget(
    p_workspace_id, p_session_id, p_reservation_id, p_target_reserved_nanos,
    p_estimated_cost_nanos
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) FROM PUBLIC, "anon", "authenticated";

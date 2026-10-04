CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context (
  workspace_id uuid,
  model        text,
  endpoint     text,
  api_key_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_context jsonb;
  v_budget_status jsonb;
begin
  v_context := public.gateway_fetch_request_context_without_workspace_budget(workspace_id, model, endpoint, api_key_id);
  v_budget_status := public.gateway_workspace_budget_status(workspace_id, 0);
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean, true)
    and not coalesce((v_budget_status->>'ok')::boolean, true) then
    v_context := jsonb_set(v_context, '{key_limit_ok}', v_budget_status, true);
  end if;
  return v_context;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) IS 'V2 gateway request context with current and historical workspace publisher handle resolution.';

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) FROM PUBLIC, "anon", "authenticated";

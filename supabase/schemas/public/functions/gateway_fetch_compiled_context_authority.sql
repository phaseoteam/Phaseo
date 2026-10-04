CREATE OR REPLACE FUNCTION public.gateway_fetch_compiled_context_authority (
  workspace_id uuid,
  model        text,
  endpoint     text,
  api_key_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_context jsonb;
  v_budget jsonb;
  v_runtime jsonb;
  v_owner uuid;
begin
  if model is null or length(model) not between 1 and 512
      or endpoint is null or length(endpoint) not between 1 and 128 then
    raise exception 'invalid_context_request' using errcode = '22023';
  end if;
  v_context := private.gateway_compiled_context_access(workspace_id, model, endpoint, api_key_id);
  v_budget := public.gateway_workspace_budget_status(workspace_id, 0);
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean,true)
      and not coalesce((v_budget->>'ok')::boolean,true) then
    v_context := jsonb_set(v_context,'{key_limit_ok}',v_budget,true);
  end if;
  if jsonb_array_length(coalesce(v_budget->'budgets','[]'::jsonb)) > 0 then
    v_context := jsonb_set(v_context,'{key_limit_ok,budgets}',v_budget->'budgets',true);
  end if;
  v_runtime := public.gateway_fetch_workspace_runtime(workspace_id);
  select w.owner_user_id into v_owner from public.workspaces w where w.id = workspace_id;
  if v_owner is null then raise exception 'workspace_owner_missing'; end if;
  return jsonb_build_object('context',v_context,
    'workspaceRuntime',v_runtime || jsonb_build_object('ownerId',v_owner));
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_compiled_context_authority"(uuid, text, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_compiled_context_authority"(uuid, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_compiled_context_authority"(uuid, text, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_compiled_context_authority"(uuid, text, text, uuid) FROM PUBLIC, "anon", "authenticated";

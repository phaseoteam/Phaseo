CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context_bundle_v2 (
  workspace_id      uuid,
  model             text,
  endpoint          text,
  api_key_id        uuid,
  include_catalog   boolean DEFAULT true,
  include_workspace boolean DEFAULT true
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_context jsonb;
  v_budget jsonb;
  v_catalog jsonb;
  v_workspace jsonb;
  v_endpoints text[];
begin
  if model is null or length(model) not between 1 and 512 or model like '@%'
    or endpoint is null or endpoint not in ('responses','chat.completions','messages','text.generate')
    or include_catalog is null or include_workspace is null then
    raise exception 'unsupported_context_bundle' using errcode='22023';
  end if;
  v_context := private.gateway_context_access(workspace_id,model,endpoint,api_key_id);
  v_budget := public.gateway_workspace_budget_status(workspace_id,0);
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean,true) and not coalesce((v_budget->>'ok')::boolean,true) then
    v_context := jsonb_set(v_context,'{key_limit_ok}',v_budget,true);
  end if;
  if jsonb_array_length(coalesce(v_budget->'budgets','[]'::jsonb))>0 then
    v_context := jsonb_set(v_context,'{key_limit_ok,budgets}',v_budget->'budgets',true);
  end if;
  if include_workspace then v_workspace := public.gateway_fetch_workspace_runtime(workspace_id); end if;
  v_endpoints := case when endpoint='text.generate' then array['text.generate'] else array['text.generate',endpoint] end;
  if include_catalog then v_catalog := public.gateway_fetch_public_catalog(model,v_endpoints); end if;
  return jsonb_build_object('context',v_context,'workspaceRuntime',v_workspace,'catalog',v_catalog);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_bundle_v2"(uuid, text, text, uuid, boolean, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_bundle_v2"(uuid, text, text, uuid, boolean, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_bundle_v2"(uuid, text, text, uuid, boolean, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_bundle_v2"(uuid, text, text, uuid, boolean, boolean) FROM PUBLIC, "anon", "authenticated";

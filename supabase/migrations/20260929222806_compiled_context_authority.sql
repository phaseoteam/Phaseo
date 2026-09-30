-- phaseo:allow-production-history-backfill reason: Restore the exact migration already recorded as applied in production.
SET lock_timeout = '3s'; SET statement_timeout = '30s';
-- Local routing rebuild. Apply only with the corresponding gateway rollout.
-- Keep deployed access/financial checks verbatim; remove public alias resolution
-- from the new entrypoint. Public canonical identity belongs to the snapshot.
do $migration$
declare
  definition text;
  first_alias integer;
  first_key integer;
begin
  definition := pg_get_functiondef('private.gateway_context_access(uuid,text,text,uuid)'::regprocedure);
  first_alias := strpos(definition, '  -- Resolve alias/model indirection:');
  first_key := strpos(definition, '  -- validate key row, status, and team');
  if first_alias = 0 or first_key <= first_alias then
    raise exception 'Unexpected access definition; review canonical access split';
  end if;
  definition := left(definition, first_alias - 1)
    || E'  resolved_model := base_model;\n\n' || substring(definition from first_key);
  definition := replace(definition, 'gateway_context_access', 'gateway_compiled_context_access');
  if definition ~ 'public\.v2_' then
    raise exception 'Public catalogue dependency remains in compiled authority';
  end if;
  execute definition;
end
$migration$;
revoke all on function private.gateway_compiled_context_access(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function private.gateway_compiled_context_access(uuid,text,text,uuid) to service_role;

create or replace function public.gateway_fetch_compiled_context_authority(
  workspace_id uuid, model text, endpoint text, api_key_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
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
revoke all on function public.gateway_fetch_compiled_context_authority(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.gateway_fetch_compiled_context_authority(uuid,text,text,uuid) to service_role;
notify pgrst, 'reload schema';



CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context_bundle (
  workspace_id    uuid,
  model           text,
  endpoint        text,
  api_key_id      uuid,
  include_catalog boolean DEFAULT true
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_context jsonb;
  v_budget jsonb;
  v_byok jsonb;
  v_settings jsonb;
  v_billing text;
  v_catalog jsonb;
  v_endpoints text[];
begin
  if model like '@%' or endpoint not in ('responses','chat.completions','messages','text.generate') then
    raise exception 'unsupported_context_bundle' using errcode='22023';
  end if;
  v_context := private.gateway_context_access(workspace_id,model,endpoint,api_key_id);
  v_budget := public.gateway_workspace_budget_status(workspace_id,0);
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean,true) and not coalesce((v_budget->>'ok')::boolean,true) then
    v_context := jsonb_set(v_context,'{key_limit_ok}',v_budget,true);
  end if;
  -- Return configured workspace budgets even when below their limit, so Workers
  -- never reuse an admission snapshot for a workspace with a spending cap.
  if jsonb_array_length(coalesce(v_budget->'budgets','[]'::jsonb))>0 then
    v_context := jsonb_set(v_context,'{key_limit_ok,budgets}',v_budget->'budgets',true);
  end if;
  select coalesce(jsonb_object_agg(provider_id,items),'{}'::jsonb) into v_byok from (
    select bk.provider_id,jsonb_agg(jsonb_build_object('provider_id',bk.provider_id,'id',bk.id,
      'fingerprint_sha256',bk.fingerprint_sha256,'key_version',bk.key_version,'always_use',bk.always_use)) as items
    from public.byok_keys bk where bk.workspace_id=gateway_fetch_request_context_bundle.workspace_id and bk.enabled
    group by bk.provider_id
  ) byok;
  select jsonb_build_object(
    'routing_mode',s.routing_mode,'byok_fallback_enabled',s.byok_fallback_enabled,'beta_channel_enabled',s.beta_channel_enabled,
    'alpha_channel_enabled',s.alpha_channel_enabled,'cache_aware_routing_enabled',s.cache_aware_routing_enabled,
    'privacy_zdr_only',s.privacy_zdr_only,'privacy_enable_paid_may_train',s.privacy_enable_paid_may_train,
    'privacy_enable_free_may_train',s.privacy_enable_free_may_train,'privacy_enable_input_output_logging',s.privacy_enable_input_output_logging,
    'io_logging_enabled',s.io_logging_enabled,'io_logging_include_provider_payloads',s.io_logging_include_provider_payloads,
    'data_contribution_enabled',s.data_contribution_enabled,'data_contribution_policy_version',s.data_contribution_policy_version,
    'data_contribution_sample_rate_bps',s.data_contribution_sample_rate_bps,'data_contribution_classifier_sample_rate_bps',s.data_contribution_classifier_sample_rate_bps,
    'data_contribution_discount_bps',s.data_contribution_discount_bps,'response_healing_enabled',s.response_healing_enabled,
    'response_healing_locked',s.response_healing_locked,'response_healing_mode',s.response_healing_mode
  ) into v_settings from public.workspace_settings s where s.workspace_id=gateway_fetch_request_context_bundle.workspace_id;
  select billing_mode into v_billing from public.workspaces where id=workspace_id;
  if v_settings is null or v_billing is null or v_billing not in ('wallet','invoice') then
    raise exception 'workspace_context_enrichment_missing';
  end if;
  v_endpoints := case when endpoint='text.generate' then array['text.generate'] else array['text.generate',endpoint] end;
  if include_catalog then v_catalog := public.gateway_fetch_public_catalog(model,v_endpoints); end if;
  return jsonb_build_object('context',v_context,'byok',v_byok,'settings',v_settings,'billingMode',v_billing,'catalog',v_catalog);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) FROM PUBLIC, "anon", "authenticated";

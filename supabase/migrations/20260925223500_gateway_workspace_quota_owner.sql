-- Add trusted owner identity to the private runtime snapshot. No new table,
-- wallet mutation or additional hot-path query. Deploy the optional-field reader first.
create or replace function public.gateway_fetch_workspace_runtime(p_workspace_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_settings jsonb;
  v_byok jsonb;
  v_billing text;
  v_tier text;
  v_owner uuid;
  v_checked bigint := floor(extract(epoch from statement_timestamp()) * 1000);
begin
  if p_workspace_id is null then raise exception 'missing_workspace_id' using errcode='22023'; end if;
  select w.billing_mode,w.tier,w.owner_user_id into v_billing,v_tier,v_owner from public.workspaces w where w.id=p_workspace_id;
  -- Explicit allowlist: a future private settings column cannot leak into KV.
  select jsonb_build_object(
    'routing_mode',s.routing_mode,'byok_fallback_enabled',s.byok_fallback_enabled,
    'beta_channel_enabled',s.beta_channel_enabled,'alpha_channel_enabled',s.alpha_channel_enabled,
    'cache_aware_routing_enabled',s.cache_aware_routing_enabled,
    'privacy_zdr_only',s.privacy_zdr_only,'privacy_enable_paid_may_train',s.privacy_enable_paid_may_train,
    'privacy_enable_free_may_train',s.privacy_enable_free_may_train,
    'privacy_enable_input_output_logging',s.privacy_enable_input_output_logging,
    'privacy_enable_free_may_publish_prompts',s.privacy_enable_free_may_publish_prompts,
    'provider_restriction_mode',s.provider_restriction_mode,'provider_restriction_provider_ids',s.provider_restriction_provider_ids,
    'provider_restriction_enforce_allowed',s.provider_restriction_enforce_allowed,
    'model_restriction_mode',s.model_restriction_mode,'model_restriction_model_ids',s.model_restriction_model_ids,
    'io_logging_enabled',s.io_logging_enabled,'io_logging_retention_days',s.io_logging_retention_days,
    'io_logging_include_provider_payloads',s.io_logging_include_provider_payloads,
    'data_contribution_enabled',s.data_contribution_enabled,'data_contribution_policy_version',s.data_contribution_policy_version,
    'data_contribution_sample_rate_bps',s.data_contribution_sample_rate_bps,
    'data_contribution_classifier_sample_rate_bps',s.data_contribution_classifier_sample_rate_bps,
    'data_contribution_discount_bps',s.data_contribution_discount_bps,
    'response_healing_enabled',s.response_healing_enabled,'response_healing_locked',s.response_healing_locked,
    'response_healing_mode',s.response_healing_mode,
    'auto_routing_allowed_patterns',s.auto_routing_allowed_patterns,'auto_routing_spend_profile',s.auto_routing_spend_profile,
    'auto_routing_max_input_price_per_million',s.auto_routing_max_input_price_per_million,
    'auto_routing_max_output_price_per_million',s.auto_routing_max_output_price_per_million,
    'auto_routing_objective',s.auto_routing_objective,'auto_routing_fallbacks_enabled',s.auto_routing_fallbacks_enabled,
    'auto_routing_revision',s.auto_routing_revision
  ) into v_settings from public.workspace_settings s where s.workspace_id=p_workspace_id;
  if v_settings is null or v_billing is null or v_billing not in ('wallet','invoice') then
    raise exception 'workspace_context_enrichment_missing';
  end if;
  select coalesce(jsonb_object_agg(provider_id,items),'{}'::jsonb) into v_byok from (
    select bk.provider_id,jsonb_agg(jsonb_build_object(
      'provider_id',bk.provider_id,'id',bk.id,'fingerprint_sha256',bk.fingerprint_sha256,
      'key_version',bk.key_version,'always_use',bk.always_use) order by bk.id) as items
    from public.byok_keys bk where bk.workspace_id=p_workspace_id and bk.enabled group by bk.provider_id
  ) refs;
  return jsonb_build_object('version',1,'workspaceId',p_workspace_id,'checkedAtMs',v_checked,
    'ownerUserId',v_owner,'expiresAtMs',v_checked+60000,'configuredTier',v_tier,'billingMode',v_billing,'settings',v_settings,'byok',v_byok);
end;
$function$;
revoke all on function public.gateway_fetch_workspace_runtime(uuid) from public,anon,authenticated;
grant execute on function public.gateway_fetch_workspace_runtime(uuid) to service_role;


notify pgrst, 'reload schema';

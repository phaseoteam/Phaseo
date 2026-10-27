CREATE OR REPLACE FUNCTION public.resolve_catalog_data_policy(p_provider_model_id text, p_capability_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $function$
DECLARE
  cap public.v2_route_capabilities%rowtype;
  route public.v2_model_provider_routes%rowtype;
  source public.provider_catalog_sources%rowtype;
  approval public.provider_catalog_policy_approvals%rowtype;
  declaration jsonb;
  valid_until timestamptz;
  accepted boolean := false;
  guaranteed boolean := false;
  result jsonb;
BEGIN
  SELECT * INTO cap FROM public.v2_route_capabilities WHERE provider_model_id=p_provider_model_id AND capability_id=p_capability_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Existing pins remain admin-owned. Never overwrite them with a feed claim.
  IF jsonb_typeof(cap.metadata->'data_policy')='object' THEN RETURN cap.metadata->'data_policy'; END IF;
  IF NOT coalesce(cap.metadata ? 'catalog_data_policy',false) THEN RETURN NULL; END IF;
  SELECT * INTO route FROM public.v2_model_provider_routes WHERE provider_model_id=p_provider_model_id;
  SELECT * INTO source FROM public.provider_catalog_sources WHERE provider_slug=route.provider_slug;
  SELECT * INTO approval FROM public.provider_catalog_policy_approvals WHERE provider_slug=route.provider_slug;
  declaration := cap.metadata->'catalog_data_policy'->'declaration';
  valid_until := source.last_success_at + interval '24 hours';
  accepted := coalesce(approval.enabled AND source.status='active'
    AND approval.catalog_url IS NOT DISTINCT FROM source.catalog_url
    AND approval.management_mode=source.management_mode
    AND cap.metadata->'catalog_data_policy'->>'catalogUrl' IS NOT DISTINCT FROM source.catalog_url
    AND cap.metadata->'catalog_data_policy'->>'managementMode'=source.management_mode
    AND declaration->>'privacy_policy_url'=approval.privacy_policy_url
    AND declaration->'requirements'->>'contract_mode'='none'
    AND declaration->'requirements'->'account_settings'='[]'::jsonb
    AND declaration->>'training_policy' not in ('opt_out_available','enterprise_no_train')
    AND declaration->>'zdr_eligibility'<>'conditional'
    AND valid_until > now(), false);
  guaranteed := accepted AND p_capability_id='text.generate'
    AND coalesce(route.metadata->>'catalog_service_tier','standard')<>'batch'
    AND declaration->'zero_data_retention'='true'::jsonb
    AND declaration->>'training_policy'='no_train'
    AND declaration->>'retention_mode'='none' AND declaration->'retention_days'='0'::jsonb
    AND declaration->>'zdr_eligibility'='eligible'
    AND declaration->'requirements'->>'contract_mode'='none'
    AND declaration->'requirements'->'account_settings'='[]'::jsonb;
  result := jsonb_build_object('tier',CASE WHEN accepted THEN
      CASE WHEN declaration->>'training_policy'='unknown' THEN 'unknown'
        WHEN declaration->>'training_policy' in ('may_train','opt_out_available','enterprise_no_train') THEN 'trains'
        WHEN guaranteed THEN 'private' ELSE 'logs' END ELSE 'unknown' END,
    'confidence',CASE WHEN accepted THEN 'confirmed' ELSE 'unknown' END,
    'zeroDataRetention',coalesce(guaranteed,false),
    'zdrEligibility',CASE WHEN guaranteed THEN 'eligible' ELSE 'ineligible' END,
    'retentionMode',CASE WHEN accepted THEN declaration->>'retention_mode' ELSE 'unknown' END,
    'retentionDays',CASE WHEN accepted THEN declaration->'retention_days' ELSE 'null'::jsonb END,
    'trainingPolicy',CASE WHEN accepted THEN declaration->>'training_policy' ELSE 'unknown' END,
    'evidenceUrl',declaration->>'privacy_policy_url', 'termsOfServiceUrl',declaration->>'terms_of_service_url',
    'requirements',declaration->'requirements', 'reason',coalesce(declaration->>'notes','Provider catalog declaration.'),
    'validUntil',valid_until, 'catalogManaged',true);
  RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.resolve_catalog_data_policy(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_catalog_data_policy(text,text) TO service_role;

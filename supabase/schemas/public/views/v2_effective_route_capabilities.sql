CREATE OR REPLACE VIEW public.v2_effective_route_capabilities WITH (security_invoker = true) AS
SELECT cap.provider_model_id, cap.capability_id, cap.status, cap.max_output_tokens, cap.max_input_tokens,
  coalesce(cap.params,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('data_policy',public.resolve_catalog_data_policy(cap.provider_model_id,cap.capability_id))) AS params,
  cap.effective_from, cap.effective_to, cap.created_at, cap.updated_at,
  cap.metadata || jsonb_strip_nulls(jsonb_build_object('data_policy',public.resolve_catalog_data_policy(cap.provider_model_id,cap.capability_id))) AS metadata
FROM public.v2_route_capabilities cap;
REVOKE ALL ON public.v2_effective_route_capabilities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v2_effective_route_capabilities TO service_role;

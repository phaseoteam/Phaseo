CREATE VIEW "private"."v2_rpc_capabilities_compat" WITH (security_invoker=true) AS  SELECT provider_model_id,
    capability_id,
    status,
    max_input_tokens,
    max_output_tokens,
    params,
    effective_from,
    effective_to,
    metadata,
    created_at,
    updated_at,
    provider_model_id AS provider_api_model_id
   FROM public.v2_route_capabilities capability;

GRANT SELECT ON TABLE "private"."v2_rpc_capabilities_compat" TO "service_role";

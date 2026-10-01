-- Restore the regional-policy boundary for Meta Contributor routes.

update public.v2_model_provider_routes
set status = 'disabled',
    routing_enabled = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'regional_policy_restricted', true,
      'regional_policy_reason', 'Contributor traffic is not geographically constrained by Meta.',
      'regional_policy_restored_at', '2026-09-23T00:00:00Z'
    ),
    updated_at = now()
where provider_model_id in (
  'meta:meta/muse-spark-1.2-contributor',
  'meta:meta/muse-spark-1.3-contributor'
);

update public.v2_route_capabilities
set status = 'disabled',
    updated_at = now()
where provider_model_id in (
  'meta:meta/muse-spark-1.2-contributor',
  'meta:meta/muse-spark-1.3-contributor'
);

CREATE TYPE "public"."data_api_provider_capability_status" AS ENUM (
  'active',
  'deranked',
  'disabled',
  'inactive',
  'internal_testing',
  'deranked_lvl1',
  'deranked_lvl2',
  'deranked_lvl3',
  'coming_soon'
);

COMMENT ON TYPE "public"."data_api_provider_capability_status" IS 'Active - Available on the Gateway. Deranked - Negative Routing Penalty. Disabled - Made Inactive for the Gateway but still exists. Inactive - not available on the gateway but exists.';

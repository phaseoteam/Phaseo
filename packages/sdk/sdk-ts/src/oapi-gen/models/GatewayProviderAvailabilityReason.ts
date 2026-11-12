/**
 * A deranked route is routable only as a last resort, after every other healthy provider. `deranked_lvl1`, `deranked_lvl2` and `deranked_lvl3` are no longer returned.
 */
export type GatewayProviderAvailabilityReason =
  | "active"
  | "preview_only"
  | "gated"
  | "access_limited"
  | "region_limited"
  | "project_limited"
  | "paused"
  | "soft_blocked"
  | "deranked"
  | "deranked_lvl1"
  | "deranked_lvl2"
  | "deranked_lvl3"
  | "internal_testing"
  | "scheduled"
  | "coming_soon"
  | "provider_disabled"
  | "model_disabled"
  | "capability_disabled"
  | "provider_not_ready"
  | "provider_inactive"
  | "inactive"
  | "retired";

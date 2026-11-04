/**
 * A deranked route is routable only as a last resort, after every other healthy provider. `deranked_lvl1`, `deranked_lvl2` and `deranked_lvl3` are no longer returned.
 */
export type GatewayCapabilityStatus =
  | "active"
  | "coming_soon"
  | "deranked"
  | "deranked_lvl1"
  | "deranked_lvl2"
  | "deranked_lvl3"
  | "disabled"
  | "internal_testing";

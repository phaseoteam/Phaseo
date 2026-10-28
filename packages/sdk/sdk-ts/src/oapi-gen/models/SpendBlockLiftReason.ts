/**
 * Why a spend block was lifted: manual (an owner or admin), period_reset, below_limit (spend is under the block point again, for example after a budget was raised), rule_changed, rule_disabled or rule_deleted.
 */
export type SpendBlockLiftReason =
  | "manual"
  | "period_reset"
  | "below_limit"
  | "rule_changed"
  | "rule_disabled"
  | "rule_deleted";

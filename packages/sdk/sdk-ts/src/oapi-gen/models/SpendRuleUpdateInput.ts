/**
 * Spend rule fields to change; at least one. Give amounts as *_usd or as *_nanos (exact nanodollars), not both. Set a field to null to clear it.
 */
export interface SpendRuleUpdateInput {
  action?: "notify" | "block";
  base_amount_nanos?: number | null;
  base_amount_usd?: number | null;
  base_kind?:
    "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
  base_ref?: "daily" | "weekly" | "monthly" | null;
  block_at_amount_nanos?: number | null;
  block_at_amount_usd?: number | null;
  block_at_percent?: number;
  block_free_models?: boolean;
  cooldown_minutes?: number;
  destination_ids?: string[];
  enabled?: boolean;
  metric?: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
  name?: string;
  period?: "day" | "week" | "month" | "rolling";
  runway_days?: number | null;
  scope_id?: string | null;
  scope_type?:
    "workspace" | "key" | "member" | "department" | "model" | "provider";
  spike_floor_nanos?: number | null;
  spike_floor_usd?: number | null;
  spike_multiplier?: number | null;
  threshold_amount_nanos?: number | null;
  threshold_amount_usd?: number | null;
  threshold_percents?: number[] | null;
  time_zone?: string | null;
  window_hours?: number | null;
}

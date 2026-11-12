/**
 * A block a spend rule started once spend reached its block point. While it is active, requests in its scope get a 429 with code spend_rule_blocked and Retry-After set to resets_at. Free models are exempt unless block_free_models is true.
 */
export interface SpendBlock {
  active: boolean;
  block_free_models: boolean;
  id: string;
  lift_reason:
    | "manual"
    | "period_reset"
    | "below_limit"
    | "rule_changed"
    | "rule_disabled"
    | "rule_deleted"
    | null;
  lifted_at: string | null;
  lifted_by: string | null;
  limit_nanos: number;
  limit_usd: number;
  period_start: string;
  resets_at: string | null;
  rule_id: string | null;
  rule_name: string | null;
  scope_id: string | null;
  scope_label: string;
  scope_type:
    "workspace" | "key" | "member" | "department" | "model" | "provider";
  spend_nanos: number;
  spend_usd: number;
  started_at: string;
  workspace_id: string;
}

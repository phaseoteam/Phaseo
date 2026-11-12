export interface SpendBlockListResponse {
  data: {
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
  }[];
}

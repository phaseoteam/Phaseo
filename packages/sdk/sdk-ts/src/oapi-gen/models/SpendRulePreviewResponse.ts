export interface SpendRulePreviewResponse {
  data: {
    alert: {
      message: string;
      scope_label: string;
      title: string;
    } | null;
    balance: {
      armed: boolean;
      auto_top_up_covers: boolean;
      available_nanos: number;
      available_usd: number;
      balance_usd: number;
      burn_per_day_usd: number;
      burn_usd: number;
      low_balance: boolean;
      low_runway: boolean;
      reserved_usd: number;
      runway_days_left: number | null;
      window_hours: number;
    } | null;
    base_kind:
      "amount" | "workspace_budget" | "key_limit" | "previous_period" | null;
    base_nanos: number | null;
    base_ref: "daily" | "weekly" | "monthly" | null;
    base_usd: number | null;
    block_at_nanos: number | null;
    block_at_usd: number | null;
    computed_at: string;
    evaluated: boolean;
    metric: "spend" | "budget_percent" | "forecast" | "spike" | "balance";
    next_threshold: {
      amount_nanos: number;
      amount_usd: number;
      percent: number | null;
    } | null;
    percent: number | null;
    period: {
      end: string;
      kind: "day" | "week" | "month" | "rolling";
      start: string;
    } | null;
    reached_threshold_percent: number | null;
    rule_id: string;
    state: {
      amount_fired_at: string | null;
      armed?: boolean;
      fire_count: number;
      highest_percent_fired: number | null;
      last_fired_at: string | null;
    } | null;
    threshold_amount_nanos: number | null;
    threshold_amount_usd: number | null;
    threshold_percents: number[] | null;
    time_zone: string;
    value_nanos: number | null;
    value_usd: number | null;
  };
}

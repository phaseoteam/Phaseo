/**
 * Where a spend rule stands now. Rolling rules have their window as period. Forecast rules have a forecast object, and their thresholds are measured against the projection. Balance rules have the burn-rate window as period, the available balance as value and a balance object. Spike rules have their window as period, the spend over it as value, the median of the same window over the previous 7 days as base, the point they fire at as next_threshold and a spike object.
 */
export interface SpendRulePreview {
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
  forecast: {
    by: string;
    from: string | null;
    limit_nanos: number | null;
    limit_usd: number | null;
    projected_nanos: number | null;
    projected_percent: number | null;
    projected_usd: number | null;
    reaches_at: string | null;
    ready: boolean;
  } | null;
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
    window_hours?: number;
  } | null;
  previous_period: {
    end: string;
    start: string;
  } | null;
  reached_threshold_percent: number | null;
  rule_id: string;
  spike: {
    active_windows: number;
    baseline_nanos: number;
    baseline_usd: number;
    baseline_windows: number;
    cooldown_until: string | null;
    current_nanos: number;
    current_usd: number;
    fires_at_nanos: number;
    fires_at_usd: number;
    floor_usd: number;
    history_ready: boolean;
    multiple: number | null;
    multiplier: number;
    spiking: boolean;
    window_hours: number;
  } | null;
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
}

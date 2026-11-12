/**
 * spend: spend reached threshold_amount. budget_percent: spend reached threshold_percents of the base. forecast: spend projected to the period end reaches the threshold. spike: spend over the last window_hours is at least spike_multiplier times the median of the same window over the previous 7 days, and at least spike_floor. balance: the workspace balance or runway falls below the threshold.
 */
export type SpendRuleMetric =
  "spend" | "budget_percent" | "forecast" | "spike" | "balance";

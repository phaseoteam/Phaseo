/**
 * Events newest first, with has_more for the next page, and the rule's 12 most recent period records.
 */
export interface SpendRuleHistory {
  events: {
    base_nanos?: number | null;
    base_usd?: number | null;
    created_at: string;
    deliveries: {
      failed: number;
      pending: number;
      sent: number;
    };
    id: string;
    kind: "spend_alert" | "spend_blocked";
    message?: string | null;
    percent?: number | null;
    period?: {
      [key: string]: unknown;
    } | null;
    state?: string | null;
    threshold_amount_nanos?: number | null;
    threshold_amount_usd?: number | null;
    threshold_percent?: number | null;
    thresholds_crossed?: number[] | null;
    title?: string | null;
    value_nanos?: number | null;
    value_usd?: number | null;
  }[];
  has_more: boolean;
  periods: {
    amount_fired_at: string | null;
    fire_count: number;
    highest_percent_fired: number | null;
    last_base_nanos: number | null;
    last_base_usd: number | null;
    last_fired_at: string | null;
    last_value_nanos: number | null;
    last_value_usd: number | null;
    period_end: string | null;
    period_start: string | null;
  }[];
}

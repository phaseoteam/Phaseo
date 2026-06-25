export interface BatchBillingSummary {
  billed?: boolean;
  charged?: boolean;
  cost_nanos?: number | null;
  cost_usd?: number | null;
  currency?: string;
  estimated_nanos?: number | null;
  estimated_provider_cost?: string | null;
  estimated_user_cost?: string | null;
  estimation_sample_size?: number | null;
  estimation_total_rows?: number | null;
  estimation_truncated?: boolean | null;
  finalized_at?: string | null;
  pricing_breakdown?: {
    [key: string]: unknown;
  };
  reason?: string;
  reservation_id?: string | null;
  reservation_status?: string | null;
  reserved_nanos?: number | null;
  settled_provider_cost?: string | null;
  settled_user_cost?: string | null;
  state?: "pending" | "estimated" | "settled" | "void";
  total_nanos?: number | null;
}

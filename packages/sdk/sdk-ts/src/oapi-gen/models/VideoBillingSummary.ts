export interface VideoBillingSummary {
  billable?: boolean;
  billed_at?: string;
  charge_reason?: string | null;
  charged?: boolean | null;
  currency?: string;
  estimated_nanos?: number | null;
  estimated_provider_cost?: string | null;
  estimated_user_cost?: string | null;
  reservation_id?: string | null;
  reservation_status?: string | null;
  reserved_nanos?: number | null;
  settled_provider_cost?: string | null;
  settled_user_cost?: string | null;
  state?: "pending" | "estimated" | "settled" | "void";
  total_nanos?: number | null;
  [key: string]: unknown;
}

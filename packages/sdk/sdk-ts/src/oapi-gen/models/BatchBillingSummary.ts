export interface BatchBillingSummary {
  billed?: boolean;
  charged?: boolean;
  cost_nanos?: number;
  cost_usd?: number;
  finalized_at?: string;
  pricing_breakdown?: {
    [key: string]: unknown;
  };
  reason?: string;
}

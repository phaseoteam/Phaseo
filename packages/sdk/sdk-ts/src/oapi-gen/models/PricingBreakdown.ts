export interface PricingBreakdown {
  currency?: string;
  lines?: {
    [key: string]: unknown;
  }[];
  total_cents?: number;
  total_nanos?: number;
  total_usd_str?: string;
}

export interface RateLimitPolicyUpdateInput {
  concurrent_requests?: number | null;
  description?: string | null;
  fail_closed?: boolean;
  name?: string;
  requests_per_minute?: number | null;
  tokens_per_minute?: number | null;
}

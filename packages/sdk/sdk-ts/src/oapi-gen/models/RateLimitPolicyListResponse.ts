export interface RateLimitPolicyListResponse {
  data: {
    concurrent_requests: number | null;
    created_at: string;
    created_by?: string | null;
    description: string | null;
    fail_closed: boolean;
    id: string;
    name: string;
    requests_per_minute: number | null;
    tokens_per_minute: number | null;
    updated_at: string;
    workspace_id: string;
  }[];
  has_more: boolean;
}

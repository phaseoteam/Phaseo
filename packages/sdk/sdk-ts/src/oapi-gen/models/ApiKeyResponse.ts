export interface ApiKeyResponse {
  data: {
    created_at: string | null;
    created_by: string | null;
    creator_user_id: string | null;
    department_id?: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    include_byok_in_limit: boolean;
    label: string | null;
    last_used_at: string | null;
    limit: number | null;
    limit_remaining: number | null;
    limit_reset: "daily" | "weekly" | "monthly" | null;
    limits: {
      daily: {
        cost: number | null;
        requests: number | null;
      };
      monthly: {
        cost: number | null;
        requests: number | null;
      };
      weekly: {
        cost: number | null;
        requests: number | null;
      };
    };
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    updated_at: string | null;
    usage: number;
    usage_daily: number;
    usage_details: {
      daily: {
        cost: number;
        requests: number;
      };
      monthly: {
        cost: number;
        requests: number;
      };
      total: {
        cost: number;
        requests: number;
      };
      weekly: {
        cost: number;
        requests: number;
      };
    };
    usage_monthly: number;
    usage_weekly: number;
    workspace_id: string;
  };
}

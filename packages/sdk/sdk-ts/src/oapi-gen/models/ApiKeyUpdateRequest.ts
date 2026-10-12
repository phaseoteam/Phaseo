export interface ApiKeyUpdateRequest {
  department_id?: string | null;
  disabled?: boolean;
  expires_at?: string | null;
  include_byok_in_limit?: boolean;
  limit?: number | null;
  limit_reset?: "daily" | "weekly" | "monthly";
  limits?: {
    daily?: {
      cost?: number | null;
      requests?: number | null;
    };
    monthly?: {
      cost?: number | null;
      requests?: number | null;
    };
    weekly?: {
      cost?: number | null;
      requests?: number | null;
    };
  };
  name?: string;
  scopes?: string | string[];
  soft_blocked?: boolean;
}

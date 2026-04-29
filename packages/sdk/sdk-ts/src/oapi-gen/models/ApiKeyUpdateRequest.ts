export interface ApiKeyUpdateRequest {
  disabled?: boolean;
  expires_at?: string | null;
  include_byok_in_limit?: boolean;
  limit?: number | null;
  limit_reset?: "daily" | "weekly" | "monthly";
  name?: string;
  scopes?: string | string[];
  soft_blocked?: boolean;
}

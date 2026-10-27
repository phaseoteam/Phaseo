/**
 * A trusted workload: tokens from this issuer, for the pinned owner and matching every claim condition, authenticate as the policy's key.
 */
export interface WorkloadIdentityPolicy {
  audience: string;
  claim_conditions: {
    [key: string]: string[];
  };
  created_at: string;
  created_by: string | null;
  id: string;
  issuer: string;
  key_id: string;
  last_used_at: string | null;
  max_token_lifetime_seconds: number;
  name: string;
  owner_id: string;
  provider: "vercel" | "github_actions";
  status: "active" | "disabled";
  updated_at: string;
}

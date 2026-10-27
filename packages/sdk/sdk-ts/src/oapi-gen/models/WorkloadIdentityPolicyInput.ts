export interface WorkloadIdentityPolicyInput {
  claim_conditions?: {
    [key: string]: string[];
  };
  issuer?: string;
  max_token_lifetime_seconds?: number;
  name: string;
  owner_id: string;
  provider: "vercel" | "github_actions";
}

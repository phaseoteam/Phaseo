export interface WorkloadIdentityPolicyUpdateInput {
  claim_conditions?: {
    [key: string]: string[];
  };
  max_token_lifetime_seconds?: number;
  name?: string;
  status?: "active" | "disabled";
}

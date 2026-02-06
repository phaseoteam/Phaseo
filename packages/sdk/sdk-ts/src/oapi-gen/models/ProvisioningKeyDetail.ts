export interface ProvisioningKeyDetail {
  created_at?: string;
  created_by?: string;
  id?: string;
  last_used_at?: string | null;
  name?: string;
  prefix?: string;
  scopes?: string;
  soft_blocked?: boolean;
  status?: "active" | "disabled" | "revoked";
  team_id?: string;
}

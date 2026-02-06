export interface ProvisioningKey {
  created_at?: string;
  id?: string;
  last_used_at?: string | null;
  name?: string;
  prefix?: string;
  scopes?: string;
  status?: "active" | "disabled" | "revoked";
}

export interface ProvisioningKeyWithValue {
  created_at?: string;
  id?: string;
  key?: string;
  name?: string;
  prefix?: string;
  scopes?: string;
  status?: "active" | "disabled" | "revoked";
}

export interface ApiKeyWithValue {
  created_at: string | null;
  created_by: string | null;
  disabled: boolean;
  expires_at: string | null;
  hash: string;
  id: string;
  key: string;
  label: string | null;
  last_used_at: string | null;
  name: string | null;
  prefix: string | null;
  scopes: string | string[];
  soft_blocked: boolean;
  status: string | null;
  updated_at: string | null;
  workspace_id: string;
}

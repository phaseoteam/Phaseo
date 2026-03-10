export interface ManagementKeyCreateRequest {
  created_by?: string;
  name: string;
  scopes?: string | string[];
  soft_blocked?: boolean;
  status?: "active" | "disabled" | "revoked";
  team_id?: string;
}

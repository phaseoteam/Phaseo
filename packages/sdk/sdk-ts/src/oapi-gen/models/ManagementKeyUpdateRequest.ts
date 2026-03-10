export interface ManagementKeyUpdateRequest {
  name?: string;
  soft_blocked?: boolean;
  status?: "active" | "disabled" | "revoked";
}

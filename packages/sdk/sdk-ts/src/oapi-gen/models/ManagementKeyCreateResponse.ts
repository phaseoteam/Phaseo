export interface ManagementKeyCreateResponse {
  key: {
    created_at?: string;
    id?: string;
    key?: string;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
  };
  ok: true;
}

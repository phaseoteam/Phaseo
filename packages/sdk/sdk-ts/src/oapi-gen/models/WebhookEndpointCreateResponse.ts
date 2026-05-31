export interface WebhookEndpointCreateResponse {
  createdAt?: string | null;
  createdBy?: string | null;
  deletedAt?: string | null;
  events?: string[];
  hasSecret?: boolean;
  id?: string;
  name?: string;
  signing_secret?: string;
  status?: "active" | "disabled" | "deleted";
  updatedAt?: string | null;
  url?: string;
  workspaceId?: string;
}

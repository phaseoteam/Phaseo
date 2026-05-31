export interface WebhookEndpoint {
  createdAt?: string | null;
  createdBy?: string | null;
  deletedAt?: string | null;
  events?: string[];
  hasSecret?: boolean;
  id?: string;
  name?: string;
  status?: "active" | "disabled" | "deleted";
  updatedAt?: string | null;
  url?: string;
  workspaceId?: string;
}

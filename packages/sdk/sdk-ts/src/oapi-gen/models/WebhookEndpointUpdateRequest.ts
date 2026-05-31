export interface WebhookEndpointUpdateRequest {
  events?: string[];
  name?: string;
  status?: "active" | "disabled";
  url?: string;
}

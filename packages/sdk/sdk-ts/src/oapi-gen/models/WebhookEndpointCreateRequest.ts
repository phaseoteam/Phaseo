export interface WebhookEndpointCreateRequest {
  events?: string[];
  name?: string;
  url: string;
}

export interface WebhookEndpointTestResponse {
  error: string | null;
  event_id: string;
  ok: boolean;
  response_body_preview: string | null;
  status_code: number | null;
}

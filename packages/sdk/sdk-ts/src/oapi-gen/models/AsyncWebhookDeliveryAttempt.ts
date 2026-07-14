/**
 * Recent gateway-managed async webhook delivery attempt.
 */
export interface AsyncWebhookDeliveryAttempt {
  attempt_number?: number;
  delivered_at?: string | null;
  delivery_key?: string;
  error_message?: string | null;
  event_type?: string;
  id?: string;
  max_attempts?: number;
  next_retry_at?: string | null;
  response_body_preview?: string | null;
  response_status?: number | null;
  status?: "delivered" | "scheduled_retry" | "failed_permanently";
  tried_at?: string;
}

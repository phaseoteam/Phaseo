/**
 * Sanitized async webhook configuration plus delivery state. Secrets are never returned; `has_secret` indicates whether signed deliveries are enabled. Signed deliveries include x-phaseo-signature, x-phaseo-timestamp, x-phaseo-event-id, x-phaseo-event-type, x-phaseo-delivery-key, x-phaseo-attempt, and x-phaseo-max-attempts headers.
 */
export interface AsyncWebhookPublicState {
  attempts?: {
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
  }[];
  delivery?: {
    delivered_event_types?: string[];
    delivered_events?: number;
    last_attempt_at?: string | null;
    last_attempt_status?:
      "delivered" | "scheduled_retry" | "failed_permanently" | null;
    last_delivered_at?: string | null;
    last_error_message?: string | null;
    last_failure_at?: string | null;
    last_response_status?: number | null;
    next_retry_at?: string | null;
    pending_retries?: number;
    total_attempts?: number;
  };
  events?: string[];
  has_secret?: boolean;
  url?: string | null;
}

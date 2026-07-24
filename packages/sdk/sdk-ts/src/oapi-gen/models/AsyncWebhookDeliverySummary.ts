/**
 * Public delivery summary for gateway-managed async webhooks. Use this to distinguish job execution state from webhook delivery health.
 */
export interface AsyncWebhookDeliverySummary {
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
}

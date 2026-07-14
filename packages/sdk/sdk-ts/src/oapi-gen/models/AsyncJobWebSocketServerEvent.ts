/**
 * Async job websocket envelope. `job.snapshot` is emitted immediately after upgrade, `job.updated` is emitted when the normalized async payload changes, `job.deleted` is emitted when the owned job record disappears, and `pong` replies to client `ping` messages.
 *
 */
export interface AsyncJobWebSocketServerEvent {
  data?:
    | {
        asset?: {
          bytes?: number;
          duration_seconds?: number;
          height?: number;
          id?: string;
          mime_type?: string;
          sha256?: string;
          width?: number;
        } | null;
        audio?: boolean;
        billing?: {
          billable?: boolean;
          billed_at?: string;
          charge_reason?: string | null;
          charged?: boolean | null;
          currency?: string;
          estimated_nanos?: number | null;
          estimated_provider_cost?: string | null;
          estimated_user_cost?: string | null;
          reservation_id?: string | null;
          reservation_status?: string | null;
          reserved_nanos?: number | null;
          settled_provider_cost?: string | null;
          settled_user_cost?: string | null;
          state?: "pending" | "estimated" | "settled" | "void";
          total_nanos?: number | null;
          [key: string]: unknown;
        };
        cancel_url?: string | null;
        completed_at?: number | string | null;
        content_url?: string;
        created_at?: number | string;
        download_url?: string | null;
        error?: unknown | null;
        expires_at?: number | null;
        generation_id?: string | null;
        id?: string;
        last_webhook_dispatched_at?: string | null;
        last_webhook_progress?: number | null;
        last_webhook_progress_at?: string | null;
        lifecycle_status?:
          | "pending"
          | "running"
          | "completed"
          | "failed"
          | "cancelled"
          | "expired";
        model?: string;
        native_video_id?: string | null;
        next_webhook_retry_at?: string | null;
        object?: string;
        output_access?: "bytes" | "signed_url" | "both";
        outputs?: {
          bytes_available?: boolean;
          content_url?: string;
          download_url?: string;
          expires_at?: number;
          index?: number;
          mime_type?: string;
        }[];
        poll_after_seconds?: number;
        polling_url?: string;
        progress?: number | null;
        progress_source?: string;
        provider?: string;
        request_id?: string;
        seconds?: number;
        session_id?: string;
        size?: string;
        started_at?: number | string | null;
        status?:
          | "queued"
          | "processing"
          | "completed"
          | "failed"
          | "cancelled"
          | "expired";
        usage?: {
          cost?: number;
          is_byok?: boolean;
          [key: string]: unknown;
        };
        webhook?: {
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
              | "delivered"
              | "scheduled_retry"
              | "failed_permanently"
              | null;
            last_delivered_at?: string | null;
            last_error_message?: string | null;
            last_failure_at?: string | null;
            last_response_status?: number | null;
            next_retry_at?: string | null;
            pending_retries?: number;
            total_attempts?: number;
          };
          endpoint_id?: string | null;
          events?: string[];
          has_secret?: boolean;
          url?: string | null;
        };
        websocket_url?: string;
      }
    | {
        billing?: {
          billed?: boolean;
          charged?: boolean;
          cost_nanos?: number | null;
          cost_usd?: number | null;
          currency?: string;
          estimated_nanos?: number | null;
          estimated_provider_cost?: string | null;
          estimated_user_cost?: string | null;
          estimation_sample_size?: number | null;
          estimation_total_rows?: number | null;
          estimation_truncated?: boolean | null;
          finalized_at?: string | null;
          pricing_breakdown?: {
            [key: string]: unknown;
          };
          reason?: string;
          reservation_id?: string | null;
          reservation_status?: string | null;
          reserved_nanos?: number | null;
          settled_provider_cost?: string | null;
          settled_user_cost?: string | null;
          state?: "pending" | "estimated" | "settled" | "void";
          total_nanos?: number | null;
        };
        cancel_url?: string | null;
        cancelled_at?: number;
        cancelling_at?: number;
        completed_at?: number;
        completion_window?: string;
        created_at?: number;
        endpoint?: string;
        error_file_id?: string;
        errors?: {};
        expired_at?: number;
        expires_at?: number;
        failed_at?: number;
        finalized_at?: string | null;
        finalizing_at?: number;
        id?: string;
        in_progress_at?: number;
        input_file_id?: string;
        last_webhook_dispatched_at?: string | null;
        last_webhook_progress?: number | null;
        last_webhook_progress_at?: string | null;
        lifecycle_status?:
          | "pending"
          | "running"
          | "completed"
          | "failed"
          | "cancelled"
          | "expired";
        metadata?: {};
        native_batch_id?: string | null;
        next_webhook_retry_at?: string | null;
        object?: string;
        output_file_id?: string;
        polling_url?: string;
        pricing_lines?: {
          [key: string]: unknown;
        }[];
        progress?: number;
        provider?: string;
        request_counts?: {
          completed?: number;
          failed?: number;
          total?: number;
        };
        request_id?: string;
        session_id?: string;
        status?: string;
        webhook?: {
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
              | "delivered"
              | "scheduled_retry"
              | "failed_permanently"
              | null;
            last_delivered_at?: string | null;
            last_error_message?: string | null;
            last_failure_at?: string | null;
            last_response_status?: number | null;
            next_retry_at?: string | null;
            pending_retries?: number;
            total_attempts?: number;
          };
          endpoint_id?: string | null;
          events?: string[];
          has_secret?: boolean;
          url?: string | null;
        };
        websocket_url?: string;
      }
    | {
        id?: string;
        kind?: "batch" | "video";
        [key: string]: unknown;
      }
    | null;
  type: "job.snapshot" | "job.updated" | "job.deleted" | "pong";
  [key: string]: unknown;
}

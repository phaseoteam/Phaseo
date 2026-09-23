export interface ErrorFailureSampleItem {
  normalized_error_action?: string | null;
  normalized_error_code?: string | null;
  normalized_error_help_url?: string | null;
  normalized_error_message?: string | null;
  provider?: string | null;
  retryable?: boolean | null;
  status?: number | null;
  type?: string | null;
  upstream_error_code?: string | null;
  upstream_error_description?: string | null;
  upstream_error_message?: string | null;
  upstream_error_param?: string | null;
  upstream_payload_preview?: string | null;
  [key: string]: unknown;
}

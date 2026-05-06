export interface ErrorResponse {
  attempt_count?: number;
  description?: string;
  details?: {
    [key: string]: unknown;
  }[];
  error:
    | string
    | {
        [key: string]: unknown;
      };
  error_origin?: "user" | "gateway" | "upstream";
  error_type?: "user" | "system";
  failed_providers?: string[];
  failed_statuses?: number[];
  failure_sample?: {
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
  }[];
  generation_id?: string;
  message?: string;
  missing_pricing_providers?: string[];
  ok?: boolean;
  provider_candidate_diagnostics?: {
    candidateCount?: number;
    droppedMissingAdapter?: {
      endpoint?: string | null;
      providerId?: string | null;
      [key: string]: unknown;
    }[];
    droppedUnsupportedEndpoint?: string[];
    supportsEndpointCount?: number;
    totalProviders?: number;
    [key: string]: unknown;
  };
  provider_enablement?: {
    capability?: string;
    dropped?: {
      providerId?: string | null;
      reason?: string | null;
      [key: string]: unknown;
    }[];
    providersAfter?: string[];
    providersBefore?: string[];
    [key: string]: unknown;
  };
  provider_failure_diagnostics?: {
    category?:
      | "credentials_not_configured"
      | "credentials_invalid_or_forbidden"
      | "provider_access_missing"
      | "region_or_project_restriction"
      | "model_unavailable_for_endpoint"
      | "rate_limited"
      | "server_error";
    hint?: string;
    provider?: string | null;
  };
  provider_payment_required_provider?: string;
  provider_payment_required_support_notice?: string;
  reason?: string;
  routing_diagnostics?: {
    filterStages?: {
      afterCount?: number;
      beforeCount?: number;
      droppedProviders?: {
        providerId?: string | null;
        reason?: string | null;
        [key: string]: unknown;
      }[];
      stage?: string;
      [key: string]: unknown;
    }[];
    [key: string]: unknown;
  };
  status_code?: number;
  upstream_error?: {
    code?: string | null;
    description?: string | null;
    message?: string | null;
    param?: string | null;
  };
  [key: string]: unknown;
}

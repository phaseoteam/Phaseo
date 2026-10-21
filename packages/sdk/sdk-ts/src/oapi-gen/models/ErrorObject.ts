/**
 * A gateway error in the shape OpenAI's SDKs read. `type` is set from the HTTP status: invalid_request_error for most 4xx, authentication_error (401), insufficient_quota (402), permission_error (403), not_found_error (404), rate_limit_error (429), service_unavailable (503), overloaded (529) and server_error for other 5xx.
 */
export interface ErrorObject {
  code: string;
  message: string;
  metadata?: {
    [key: string]: unknown;
  };
  param?: string | null;
  type:
    | "invalid_request_error"
    | "authentication_error"
    | "permission_error"
    | "not_found_error"
    | "rate_limit_error"
    | "insufficient_quota"
    | "server_error"
    | "service_unavailable"
    | "overloaded";
  [key: string]: unknown;
}

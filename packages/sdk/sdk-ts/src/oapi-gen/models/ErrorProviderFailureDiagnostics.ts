export interface ErrorProviderFailureDiagnostics {
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
}

export interface DebugResponse {
  enabled?: boolean;
  return_upstream_request?: boolean;
  return_upstream_response?: boolean;
  trace?: {
    [key: string]: unknown;
  }[];
  trace_level?: "summary" | "full";
}

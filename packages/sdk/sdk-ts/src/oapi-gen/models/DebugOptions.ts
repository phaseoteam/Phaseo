/**
 * Debug options for request tracing and upstream capture.
 */
export interface DebugOptions {
  enabled?: boolean;
  return_upstream_request?: boolean;
  return_upstream_response?: boolean;
  trace?: boolean;
  trace_level?: "summary" | "full";
}

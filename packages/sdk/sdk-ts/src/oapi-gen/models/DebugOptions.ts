/**
 * Gateway debug controls. These flags are never forwarded upstream.
 */
export interface DebugOptions {
  enabled?: boolean;
  return_upstream_request?: boolean;
  return_upstream_response?: boolean;
  trace?: boolean;
  trace_level?: "summary" | "full";
}

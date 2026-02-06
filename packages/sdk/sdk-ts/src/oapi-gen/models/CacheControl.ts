/**
 * Optional prompt caching metadata (Anthropic-compatible).
 */
export interface CacheControl {
  cache?: {
    ttl?: "5m" | "1h";
    type?: "ehpemeral" | "ephemeral";
  };
  ttl?: "5m" | "1h";
  type?: "ehpemeral" | "ephemeral";
}

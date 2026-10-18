/**
 * Prompt cache control. Use type ephemeral with an optional ttl of 5m or 1h. scope applies only to a top-level Claude cache policy.
 */
export interface CacheControl {
  scope?: string;
  ttl?: string;
  type?: string;
  [key: string]: unknown;
}

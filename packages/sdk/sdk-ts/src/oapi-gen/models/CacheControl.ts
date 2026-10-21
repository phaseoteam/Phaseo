/**
 * Prompt cache control. Use type ephemeral with an optional ttl of 5m or 1h. scope applies only to a top-level Claude cache policy. Amazon Bedrock and Google Vertex AI cache Claude 3.7 Sonnet, 3.5 Sonnet and 3 Opus for 5 minutes only; there the ttl is removed and a removed 1h is reported in X-Phaseo-Dropped-Params as cache_control.ttl.
 */
export interface CacheControl {
  scope?: string;
  ttl?: string;
  type?: string;
  [key: string]: unknown;
}

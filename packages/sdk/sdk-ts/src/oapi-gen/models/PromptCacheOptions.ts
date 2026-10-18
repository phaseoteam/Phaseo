/**
 * Prompt cache mode and TTL for OpenAI and Azure OpenAI GPT-5.6 and later (ttl 30m) and for DeepInfra (ttl 5m or 1h). Removed for other providers.
 */
export interface PromptCacheOptions {
  mode?: "implicit" | "explicit";
  ttl?: string;
  [key: string]: unknown;
}

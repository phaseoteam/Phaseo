/**
 * Optional provider-specific options.
 */
export interface ProviderOptions {
  anthropic?: {
    cache_control?: {
      scope?: string;
      ttl?: string;
      type?: string;
      [key: string]: unknown;
    };
  };
  google?: {
    cache_control?: {
      scope?: string;
      ttl?: string;
      type?: string;
      [key: string]: unknown;
    };
    cache_ttl?: string;
    cached_content?: string;
  };
  openai?: {
    context_management?: {
      compact_threshold?: number;
      type: "compaction";
    };
    prompt_cache_retention?: string;
  };
}

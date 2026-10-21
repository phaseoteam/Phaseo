/**
 * Cache writes split by lifetime, on Responses usage from OpenAI GPT-5.6 and later. The two counts sum to cache_write_tokens. Not returned in Chat Completions prompt_tokens_details.
 */
export interface CacheWriteTokensDetails {
  ttl_12h_tokens?: number;
  ttl_30m_tokens?: number;
}

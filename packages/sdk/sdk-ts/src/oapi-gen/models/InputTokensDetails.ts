/**
 * Breakdown of the input tokens.
 */
export interface InputTokensDetails {
  cache_write_tokens?: number;
  cache_write_tokens_details?: {
    ttl_12h_tokens?: number;
    ttl_30m_tokens?: number;
  };
  cached_tokens?: number;
}

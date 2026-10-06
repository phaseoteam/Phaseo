export interface DecisionsUsage {
  input_tokens?: number;
  input_tokens_details?: {
    cache_write_tokens?: number;
    cached_tokens?: number;
  };
  output_tokens?: number;
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
  total_tokens?: number;
}

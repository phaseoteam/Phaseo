/**
 * Legacy SDK response model retained for compatibility. OpenAI-format requests return OpenAIDecisionsResponse.
 */
export interface DecisionsResponse {
  answers?: {
    [key: string]: unknown;
  };
  meta?: {
    [key: string]: unknown;
  };
  model?: string;
  request_id?: string | null;
  usage?: {
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
  };
}

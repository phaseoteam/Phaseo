/**
 * Deprecated compatibility alias. Use DecisionsResponse.
 */
export interface SystemOneResponse {
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
    output_tokens?: number;
    total_tokens?: number;
  };
}

export interface AnthropicUsage {
  cache_creation?: {
    ephemeral_1h_input_tokens?: number;
    ephemeral_5m_input_tokens?: number;
  };
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cost?: number;
  cost_details?: {
    upstream_inference_cost?: number | null;
  };
  input_tokens?: number;
  output_tokens?: number;
}

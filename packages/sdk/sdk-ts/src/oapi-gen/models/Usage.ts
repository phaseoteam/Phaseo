export interface Usage {
  completion_tokens?: number;
  cost?: number;
  cost_details?: {
    upstream_inference_cost?: number | null;
  };
  input_tokens?: number;
  input_tokens_details?: {
    cache_write_tokens?: number;
    cached_tokens?: number;
  };
  output_tokens?: number;
  prompt_tokens?: number;
  prompt_tokens_details?: {
    cache_write_tokens?: number;
    cached_tokens?: number;
  };
  server_tool_use?: {
    advisor_requests?: number;
    apply_patch_requests?: number;
    datetime_requests?: number;
    fusion_requests?: number;
    image_generation_requests?: number;
    search_models_requests?: number;
    subagent_requests?: number;
    web_fetch_requests?: number;
    web_search_requests?: number;
  };
  total_tokens?: number;
}

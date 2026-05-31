export interface EmbeddingsResponse {
  data?: {
    embedding?: number[];
    index?: number;
    object?: string;
  }[];
  model?: string;
  object?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    server_tool_use?: {
      apply_patch_requests?: number;
      datetime_requests?: number;
      fusion_requests?: number;
      image_generation_requests?: number;
      tool_search_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}

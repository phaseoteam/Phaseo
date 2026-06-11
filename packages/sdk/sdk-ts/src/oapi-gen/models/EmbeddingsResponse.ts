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
      advisor_requests?: number;
      apply_patch_requests?: number;
      datetime_requests?: number;
      image_generation_requests?: number;
      web_fetch_requests?: number;
      web_search_extra_results?: number;
      web_search_requests?: number;
      web_search_results?: number;
    };
    total_tokens?: number;
  };
}

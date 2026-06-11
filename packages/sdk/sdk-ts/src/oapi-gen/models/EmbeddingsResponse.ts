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
      datetime_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}

export interface RerankResponse {
  id?: string;
  model?: string;
  nativeResponseId?: string | null;
  object?: string;
  results?: {
    document?:
      | string
      | {
          [key: string]: unknown;
        };
    index?: number;
    relevance_score?: number;
  }[];
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    server_tool_use?: {
      datetime_requests?: number;
    };
    total_tokens?: number;
  };
}

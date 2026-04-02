export interface Usage {
  completion_tokens?: number;
  prompt_tokens?: number;
  server_tool_use?: {
    datetime_requests?: number;
  };
  total_tokens?: number;
}

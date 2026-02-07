export interface ResponsesResponse {
  content?: {}[];
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  role?: string;
  stop_reason?: string;
  type?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

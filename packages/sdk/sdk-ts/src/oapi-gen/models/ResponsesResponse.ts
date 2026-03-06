export interface ResponsesResponse {
  content?: {}[];
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  output?: {
    content?: {}[];
    role?: string;
    type?: string;
  }[];
  output_items?: {
    content?: {}[];
    role?: string;
    type?: string;
  }[];
  role?: string;
  stop_reason?: string;
  type?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

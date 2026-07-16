export interface InteractionResponse {
  created?: number;
  id: string;
  model: string;
  object: "interaction";
  output_text?: string;
  status: "completed" | "failed" | "incomplete" | "requires_action";
  steps: {
    arguments?:
      | string
      | {
          [key: string]: unknown;
        };
    call_id?: string;
    content?:
      | string
      | {
          data?: string;
          mime_type?: string;
          text?: string;
          type: "text" | "image" | "audio" | "video" | "document";
          uri?: string;
          [key: string]: unknown;
        }[];
    id?: string;
    is_error?: boolean;
    name?: string;
    result?:
      | string
      | {
          [key: string]: unknown;
        };
    signature?: string;
    summary?:
      | string
      | {
          data?: string;
          mime_type?: string;
          text?: string;
          type: "text" | "image" | "audio" | "video" | "document";
          uri?: string;
          [key: string]: unknown;
        };
    type:
      | "user_input"
      | "model_output"
      | "thought"
      | "function_call"
      | "function_result";
    [key: string]: unknown;
  }[];
  usage?: {
    total_cached_tokens?: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
    total_thought_tokens?: number;
    total_tokens?: number;
    [key: string]: unknown;
  };
}

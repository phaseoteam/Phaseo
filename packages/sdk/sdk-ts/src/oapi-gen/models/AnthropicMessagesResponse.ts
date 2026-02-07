export interface AnthropicMessagesResponse {
  content?: {
    content?: string;
    id?: string;
    input?: {};
    name?: string;
    source?: {
      data?: string;
      media_type?: string;
      type?: string;
      url?: string;
    };
    text?: string;
    tool_use_id?: string;
    type?: "text" | "image" | "tool_use" | "tool_result";
  }[];
  id?: string;
  model?: string;
  role?: "assistant";
  stop_reason?: string;
  stop_sequence?: string;
  type?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

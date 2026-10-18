export interface AnthropicMessagesResponse {
  content?: {
    cache_control?: {
      scope?: string;
      ttl?: string;
      type?: string;
      [key: string]: unknown;
    };
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
    cache_creation?: {
      ephemeral_1h_input_tokens?: number;
      ephemeral_5m_input_tokens?: number;
    };
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

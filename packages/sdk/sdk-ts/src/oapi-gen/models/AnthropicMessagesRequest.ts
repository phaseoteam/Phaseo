export interface AnthropicMessagesRequest {
  max_tokens?: number;
  messages: {
    content:
      | string
      | {
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
    role: "user" | "assistant";
  }[];
  metadata?: {
    [key: string]: string;
  };
  model: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
  stream?: boolean;
  system?: string | {}[];
  temperature?: number;
  tool_choice?: string | {};
  tools?: {
    description?: string;
    input_schema?: {};
    name: string;
  }[];
  top_k?: number;
  top_p?: number;
}

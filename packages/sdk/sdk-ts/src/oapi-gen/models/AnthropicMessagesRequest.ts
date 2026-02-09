export interface AnthropicMessagesRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
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
    include_alpha?: boolean;
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

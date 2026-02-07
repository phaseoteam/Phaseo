export interface AnthropicMessage {
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
}

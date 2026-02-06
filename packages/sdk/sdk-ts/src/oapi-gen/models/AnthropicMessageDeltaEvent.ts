export interface AnthropicMessageDeltaEvent {
  data?: {
    delta?: {
      [key: string]: unknown;
    };
    usage?: {
      cache_creation?: {};
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
      server_tool_use?: boolean;
      service_tier?: string;
    };
    [key: string]: unknown;
  };
  event?: "message_delta";
}

export interface AnthropicSystemMessage {
  content:
    | string
    | {
        cache_control?: {
          scope?: string;
          ttl?: string;
          type?: string;
          [key: string]: unknown;
        };
        text: string;
        type: "text";
      }[];
  role: "system";
}

export interface AnthropicContentBlockDeltaEvent {
  data?: {
    delta?: {
      [key: string]: unknown;
    };
    index?: number;
    [key: string]: unknown;
  };
  event?: "content_block_delta";
}

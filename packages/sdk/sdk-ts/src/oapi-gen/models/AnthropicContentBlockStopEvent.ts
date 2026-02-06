export interface AnthropicContentBlockStopEvent {
  data?: {
    index?: number;
    [key: string]: unknown;
  };
  event?: "content_block_stop";
}

export interface AnthropicMessageStopEvent {
  data?: {
    [key: string]: unknown;
  };
  event?: "message_stop";
}

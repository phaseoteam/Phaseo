export interface ResponsesStreamReasoningTextDeltaEvent {
  data?: {
    delta?: string;
    item_id?: string;
    output_index?: number;
    [key: string]: unknown;
  };
  event?: "response.reasoning_text.delta";
}

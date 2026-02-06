export interface ResponsesStreamOutputTextDeltaEvent {
  data?: {
    delta?: string;
    item_id?: string;
    logprobs?: {} | null;
    output_index?: number;
    [key: string]: unknown;
  };
  event?: "response.output_text.delta";
}

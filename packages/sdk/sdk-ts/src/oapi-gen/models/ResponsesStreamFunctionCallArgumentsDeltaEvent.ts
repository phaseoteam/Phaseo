export interface ResponsesStreamFunctionCallArgumentsDeltaEvent {
  data?: {
    delta?: string;
    item_id?: string;
    output_index?: number;
    [key: string]: unknown;
  };
  event?: "response.function_call_arguments.delta";
}

export interface ResponsesStreamFunctionCallArgumentsDoneEvent {
  data?: {
    arguments?: string;
    item_id?: string;
    name?: string;
    output_index?: number;
    [key: string]: unknown;
  };
  event?: "response.function_call_arguments.done";
}

export interface ResponsesStreamErrorEvent {
  data?: {
    [key: string]: unknown;
  };
  event?: "response.error" | "error";
}

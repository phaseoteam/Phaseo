export interface ResponsesStreamCreatedEvent {
  data?: {
    response?: {
      created_at?: number;
      id?: string;
      model?: string;
    };
  };
  event?: "response.created";
}

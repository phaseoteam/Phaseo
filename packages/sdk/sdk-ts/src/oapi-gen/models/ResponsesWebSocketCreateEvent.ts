export interface ResponsesWebSocketCreateEvent {
  input?: string | {}[] | {};
  model: string;
  previous_response_id?: string | null;
  store?: boolean;
  tool_choice?: string | {};
  tools?: {}[];
  type: "response.create";
  [key: string]: unknown;
}

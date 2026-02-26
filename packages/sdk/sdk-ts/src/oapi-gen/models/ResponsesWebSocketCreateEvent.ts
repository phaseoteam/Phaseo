/**
 * Client message for websocket turn creation. Gateway performs lightweight validation (`type` and `model` format) before forwarding to OpenAI; deeper request-shape validation is enforced by upstream.
 *
 */
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

/**
 * Streamed websocket event. Mirrors OpenAI Responses event payloads (for example `response.created`, `response.output_text.delta`, `response.completed`, or `error`).
 *
 */
export interface ResponsesWebSocketServerEvent {
  error?: {};
  response?: {};
  status?: number;
  type?: string;
  [key: string]: unknown;
}

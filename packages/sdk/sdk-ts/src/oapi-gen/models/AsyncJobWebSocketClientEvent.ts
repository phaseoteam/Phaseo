/**
 * Client message for async job websocket sessions.
 */
export interface AsyncJobWebSocketClientEvent {
  type: "ping" | "refresh";
}

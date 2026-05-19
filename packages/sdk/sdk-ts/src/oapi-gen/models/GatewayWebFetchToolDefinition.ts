/**
 * Gateway-managed server tool. The gateway fetches one HTTP(S) page, reduces it to bounded text, and injects the result back into the model tool loop.
 *
 */
export interface GatewayWebFetchToolDefinition {
  max_chars?: number;
  parameters?: {
    max_chars?: number;
  };
  type: "gateway:web_fetch";
}

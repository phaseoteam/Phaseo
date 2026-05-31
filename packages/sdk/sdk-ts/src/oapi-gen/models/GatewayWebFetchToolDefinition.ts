/**
 * Gateway-managed server tool. The gateway fetches one HTTP(S) page, reduces it to bounded text, and injects the result back into the model tool loop.
 *
 */
export interface GatewayWebFetchToolDefinition {
  allowed_domains?: string[];
  excluded_domains?: string[];
  max_chars?: number;
  parameters?: {
    allowed_domains?: string[];
    excluded_domains?: string[];
    max_chars?: number;
  };
  type: "gateway:web_fetch";
}

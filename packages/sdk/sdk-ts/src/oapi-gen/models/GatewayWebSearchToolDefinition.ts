/**
 * Gateway-managed server tool. The gateway executes a web search and injects normalized search results back into the model tool loop.
 *
 */
export interface GatewayWebSearchToolDefinition {
  include_highlights?: boolean;
  include_text?: boolean;
  max_results?: number;
  parameters?: {
    include_highlights?: boolean;
    include_text?: boolean;
    max_results?: number;
  };
  type: "gateway:web_search";
}

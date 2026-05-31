/**
 * Gateway-managed server tool. The gateway executes a web search and injects normalized search results back into the model tool loop.
 *
 */
export interface GatewayWebSearchToolDefinition {
  allowed_domains?: string[];
  engine?: "auto" | "exa";
  excluded_domains?: string[];
  include_highlights?: boolean;
  include_text?: boolean;
  max_results?: number;
  max_total_results?: number;
  parameters?: {
    allowed_domains?: string[];
    engine?: "auto" | "exa";
    excluded_domains?: string[];
    include_highlights?: boolean;
    include_text?: boolean;
    max_results?: number;
    max_total_results?: number;
    search_context_size?: "low" | "medium" | "high";
  };
  search_context_size?: "low" | "medium" | "high";
  type: "gateway:web_search";
}

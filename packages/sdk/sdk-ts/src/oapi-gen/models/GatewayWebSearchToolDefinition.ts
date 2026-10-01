/**
 * Gateway-managed server tool. The gateway executes a web search and injects normalized search results back into the model tool loop.
 *
 */
export interface GatewayWebSearchToolDefinition {
  engine?:
    | "auto"
    | "native"
    | "exa"
    | "firecrawl"
    | "parallel"
    | "perplexity"
    | "tinyfish";
  include_highlights?: boolean;
  include_text?: boolean;
  language?: string;
  max_results?: number;
  page?: number;
  parameters?: {
    engine?:
      | "auto"
      | "native"
      | "exa"
      | "firecrawl"
      | "parallel"
      | "perplexity"
      | "tinyfish";
    include_highlights?: boolean;
    include_text?: boolean;
    language?: string;
    max_results?: number;
    page?: number;
  };
  type: "phaseo:web_search" | "gateway:web_search";
}

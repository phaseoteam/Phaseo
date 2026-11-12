/**
 * Adds the `phaseo:web_search` server tool to the request, so any model can search the web. The request runs, and searches are counted and billed, exactly as with a `phaseo:web_search` tool. If the request already has a web search tool, the plugin adds nothing. Other options are ignored.
 *
 */
export interface WebSearchPlugin {
  enabled?: boolean;
  engine?:
    | "auto"
    | "native"
    | "exa"
    | "firecrawl"
    | "parallel"
    | "perplexity"
    | "tinyfish";
  exclude_domains?: string[];
  id: "web";
  include_domains?: string[];
  max_results?: number;
  max_uses?: number;
  search_context_size?: "low" | "medium" | "high";
}

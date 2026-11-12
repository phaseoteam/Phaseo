/**
 * OpenAI's hosted web search tool. OpenAI, Azure OpenAI (Responses) and xAI run it natively. On models whose providers cannot run it, the gateway runs it as `phaseo:web_search`: `search_context_size`, `filters.allowed_domains`, `max_results` and `engine` carry over, and searches are billed as `phaseo:web_search` searches. Other OpenAI hosted tools (`file_search`, `code_interpreter`, `computer_use_preview`, `mcp`, `image_generation`, `shell`, `local_shell`, `apply_patch`) fail with 400 `unsupported_hosted_tool` on models whose providers cannot run them.
 *
 */
export interface OpenAIWebSearchToolDefinition {
  filters?: {
    allowed_domains?: string[];
  };
  search_context_size?: "low" | "medium" | "high";
  type:
    | "web_search"
    | "web_search_2025_08_26"
    | "web_search_preview"
    | "web_search_preview_2025_03_11";
  user_location?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

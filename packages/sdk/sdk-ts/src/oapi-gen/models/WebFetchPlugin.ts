/**
 * Adds the `phaseo:web_fetch` server tool to the request, so any model can read web pages. The request runs, and fetches are counted and billed, exactly as with a `phaseo:web_fetch` tool. If the request already has a web fetch tool, the plugin adds nothing.
 *
 */
export interface WebFetchPlugin {
  allowed_domains?: string[];
  blocked_domains?: string[];
  enabled?: boolean;
  engine?: "auto" | "native" | "direct" | "exa" | "firecrawl" | "parallel";
  id: "web-fetch";
  max_content_tokens?: number;
  max_uses?: number;
}

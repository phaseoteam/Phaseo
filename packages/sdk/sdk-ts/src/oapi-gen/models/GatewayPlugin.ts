export type GatewayPlugin =
  | {
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
  | {
      allowed_domains?: string[];
      blocked_domains?: string[];
      enabled?: boolean;
      engine?: "auto" | "native" | "direct" | "exa" | "firecrawl" | "parallel";
      id: "web-fetch";
      max_content_tokens?: number;
      max_uses?: number;
    }
  | {
      enabled?: boolean;
      id: "response-healing";
      mode?: "safe" | "strict";
    };

/**
 * An optional top-level field sent as `null` is treated as unset, the same as leaving it out.
 */
export interface AnthropicMessagesRequest {
  cache_control?: {
    scope?: string;
    ttl?: string;
    type?: string;
    [key: string]: unknown;
  };
  context_management?: {
    edits?: {
      type: string;
      [key: string]: unknown;
    }[];
    [key: string]: unknown;
  };
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  echo_upstream_request?: boolean;
  max_tokens: number;
  messages: {
    content:
      | string
      | {
          cache_control?: {
            scope?: string;
            ttl?: string;
            type?: string;
            [key: string]: unknown;
          };
          content?: string;
          id?: string;
          input?: {};
          name?: string;
          source?: {
            data?: string;
            media_type?: string;
            type?: string;
            url?: string;
          };
          text?: string;
          tool_use_id?: string;
          type?: "text" | "image" | "tool_use" | "tool_result";
        }[];
    role: "user" | "assistant" | "system";
  }[];
  meta?: boolean;
  metadata?: {
    [key: string]: unknown;
  };
  model: string;
  models?: string[];
  plugins?: (
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
        engine?:
          "auto" | "native" | "direct" | "exa" | "firecrawl" | "parallel";
        id: "web-fetch";
        max_content_tokens?: number;
        max_uses?: number;
      }
    | {
        enabled?: boolean;
        id: "response-healing";
        mode?: "safe" | "strict";
      }
  )[];
  prompt?: {
    id: string;
    variables?: {
      [key: string]: unknown;
    };
  };
  prompt_cache_key?: string | null;
  provider?: {
    allow_fallbacks?: boolean | null;
    data_collection?: "allow" | "deny" | null;
    enforce_distillable_text?: boolean | null;
    ignore?: string[];
    include_alpha?: boolean;
    max_price?: {
      audio?: number | string;
      completion?: number | string;
      image?: number | string;
      prompt?: number | string;
      request?: number | string;
    };
    only?: string[];
    order?: string[];
    preferred_max_latency?:
      | number
      | {
          [key: string]: number;
        };
    preferred_min_throughput?:
      | number
      | {
          [key: string]: number;
        };
    quantizations?: string[] | null;
    require_parameters?: boolean | null;
    require_zero_data_retention?: boolean | null;
    required_data_region?: string | null;
    required_execution_region?: string | null;
    sort?:
      | string
      | {
          [key: string]: unknown;
        };
    zdr?: boolean | null;
  };
  provider_options?: {
    anthropic?: {
      cache_control?: {
        scope?: string;
        ttl?: string;
        type?: string;
        [key: string]: unknown;
      };
    };
    google?: {
      cache_control?: {
        scope?: string;
        ttl?: string;
        type?: string;
        [key: string]: unknown;
      };
      cache_ttl?: string;
      cached_content?: string;
    };
    openai?: {
      context_management?: {
        compact_threshold?: number;
        type: "compaction";
      };
      prompt_cache_options?: {
        mode?: "implicit" | "explicit";
        ttl?: string;
        [key: string]: unknown;
      };
      prompt_cache_retention?: string;
    };
    xai?: {
      conversation_id?: string;
    };
  };
  reasoning?: {
    effort?:
      "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null;
    enabled?: boolean;
    max_tokens?: number;
    mode?: "standard" | "pro";
    summary?: "auto" | "concise" | "detailed";
  };
  service_tier?:
    | "standard"
    | "default"
    | "fast"
    | "ultrafast"
    | "priority"
    | "flex"
    | "batch"
    | "auto"
    | "standard_only";
  session_id?: string;
  stop_sequences?: string[];
  stream?: boolean;
  system?:
    | string
    | {
        cache_control?: {
          scope?: string;
          ttl?: string;
          type?: string;
          [key: string]: unknown;
        };
        text?: string;
        type?: "text";
      }[];
  temperature?: number;
  tool_choice?: {} | string;
  tools?: (
    | {
        async?: boolean;
        description?: string;
        input_schema?: {};
        name: string;
      }
    | {
        parameters?: {
          timezone?: string;
        };
        timezone?: string;
        type: "phaseo:datetime" | "gateway:datetime";
      }
    | {
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
    | {
        max_chars?: number;
        parameters?: {
          max_chars?: number;
        };
        type: "phaseo:web_fetch" | "gateway:web_fetch";
      }
    | {
        parameters?: {
          [key: string]: unknown;
        };
        type: "phaseo:subagent";
      }
    | {
        parameters?: {
          analysis_models: string[];
          model?: string;
          [key: string]: unknown;
        };
        type: "phaseo:fusion";
      }
    | {
        parameters?: {
          max_results?: number;
        };
        type: "phaseo:search_models";
      }
  )[];
  top_k?: number;
  top_p?: number;
  usage?: boolean;
  user?: string;
}

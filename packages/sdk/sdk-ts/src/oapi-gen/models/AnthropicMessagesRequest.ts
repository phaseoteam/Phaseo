export interface AnthropicMessagesRequest {
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
    role: "user" | "assistant";
  }[];
  meta?: boolean;
  metadata?: {
    [key: string]: unknown;
  };
  model: string;
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
      prompt_cache_retention?: string;
    };
  };
  reasoning?: {
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    enabled?: boolean;
    max_tokens?: number;
    summary?: "auto" | "concise" | "detailed";
  };
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
  tools?:
    | {
        description?: string;
        input_schema?: {};
        name: string;
      }
    | {
        parameters?: {
          timezone?: string;
        };
        timezone?: string;
        type: "gateway:datetime";
      }
    | {
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
    | {
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
    | {
        parameters?: {};
        type: "gateway:apply_patch";
      }
    | {
        model?: string;
        parameters?: {
          background?: string;
          model?: string;
          n?: number;
          output_format?: string;
          quality?: string;
          response_format?: string;
          size?: string;
        };
        type: "gateway:image_generation";
      }
    | {
        analysis_models?: string[];
        include_web?: boolean;
        model?: string;
        parameters?: {
          analysis_models?: string[];
          include_web?: boolean;
          model?: string;
        };
        type: "gateway:fusion";
      }
    | {
        parameters?: {};
        type: "gateway:tool_search";
      }[];
  top_k?: number;
  top_p?: number;
  usage?: boolean;
}

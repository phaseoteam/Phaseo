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
        include_highlights?: boolean;
        include_text?: boolean;
        max_results?: number;
        parameters?: {
          include_highlights?: boolean;
          include_text?: boolean;
          max_results?: number;
        };
        type: "ai-stats:web_search";
      }
    | {
        max_chars?: number;
        parameters?: {
          max_chars?: number;
        };
        type: "ai-stats:web_fetch";
      }
    | {
        forward_transcript?: boolean;
        instructions?: string;
        max_completion_tokens?: number;
        max_tokens?: number;
        max_uses?: number;
        model?: string;
        name?: string;
        parameters?: {
          forward_transcript?: boolean;
          instructions?: string;
          max_completion_tokens?: number;
          max_tokens?: number;
          max_uses?: number;
          model?: string;
          name?: string;
          reasoning?: {
            [key: string]: unknown;
          };
          temperature?: number;
        };
        reasoning?: {
          [key: string]: unknown;
        };
        temperature?: number;
        type: "ai-stats:advisor";
      }
    | {
        aspect_ratio?: string;
        background?: string;
        description?: string;
        model?: string;
        moderation?: string;
        output_compression?: number;
        output_format?: string;
        parameters?: {
          aspect_ratio?: string;
          background?: string;
          description?: string;
          model?: string;
          moderation?: string;
          output_compression?: number;
          output_format?: string;
          prompt?: string;
          quality?: string;
          size?: string;
        };
        prompt?: string;
        quality?: string;
        size?: string;
        type: "ai-stats:image_generation";
      }[];
  top_k?: number;
  top_p?: number;
  usage?: boolean;
}

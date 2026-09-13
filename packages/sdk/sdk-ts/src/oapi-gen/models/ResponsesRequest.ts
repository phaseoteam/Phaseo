export interface ResponsesRequest {
  background?: boolean;
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  echo_upstream_request?: boolean;
  image_config?: {
    aspect_ratio?: string;
    font_inputs?: {
      font_url?: string;
      text?: string;
    }[];
    image_size?: "0.5K" | "1K" | "2K" | "4K";
    include_rai_reason?: boolean;
    reference_images?: {
      [key: string]: unknown;
    }[];
    super_resolution_references?: string[];
    [key: string]: unknown;
  };
  include?: string[];
  input:
    | string
    | {
        content?: string | {}[] | {};
        role?: "user" | "assistant" | "system" | "developer";
        type?: string;
      }[]
    | {};
  instructions?: string;
  max_output_tokens?: number;
  meta?: boolean;
  metadata?: {
    [key: string]: string;
  };
  modalities?: ("text" | "image" | "audio")[];
  model: string;
  parallel_tool_calls?: boolean;
  previous_response_id?: string;
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
      prompt_cache_retention?: string;
    };
  };
  reasoning?: {
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
    enabled?: boolean;
    max_tokens?: number;
    mode?: "standard" | "pro";
    summary?: "auto" | "concise" | "detailed";
  };
  safety_identifier?: string | null;
  service_tier?: "standard" | "fast" | "priority" | "flex" | "batch";
  session_id?: string;
  store?: boolean;
  stream?: boolean;
  temperature?: number;
  text?: {};
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | "phaseo:datetime"
    | "phaseo:web_search"
    | "phaseo:web_fetch"
    | "phaseo:subagent"
    | "phaseo:fusion"
    | "phaseo:search_models"
    | "gateway:datetime"
    | "gateway:web_search"
    | "gateway:web_fetch"
    | {};
  tools?: (
    | {
        async?: boolean;
        function: {
          description?: string;
          name: string;
          parameters: {};
        };
        type: "function";
        [key: string]: unknown;
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
  top_p?: number;
  truncation?: "auto" | "disabled";
  usage?: boolean;
  user?: string;
}

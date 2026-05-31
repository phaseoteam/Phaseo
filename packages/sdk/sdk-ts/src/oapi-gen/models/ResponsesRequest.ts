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
  modalities?: "text" | "image" | "audio"[];
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
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    enabled?: boolean;
    max_tokens?: number;
    summary?: "auto" | "concise" | "detailed";
  };
  safety_identifier?: string | null;
  service_tier?: "auto" | "default" | "flex" | "standard" | "priority";
  session_id?: string;
  store?: boolean;
  stream?: boolean;
  temperature?: number;
  text?: {};
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | "gateway:datetime"
    | "gateway:web_search"
    | "gateway:web_fetch"
    | "gateway:apply_patch"
    | "gateway:image_generation"
    | "gateway:fusion"
    | "gateway:tool_search"
    | {};
  tools?:
    | {
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
  top_p?: number;
  truncation?: "auto" | "disabled";
  usage?: boolean;
  user?: string;
}

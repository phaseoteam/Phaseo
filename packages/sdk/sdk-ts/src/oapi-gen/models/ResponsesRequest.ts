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
  modalities?: string[];
  model: string;
  parallel_tool_calls?: boolean;
  previous_response_id?: string;
  prompt_cache_key?: string | null;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
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
  store?: boolean;
  stream?: boolean;
  temperature?: number;
  text?: {};
  tool_choice?: string | {};
  tools?: {}[];
  top_p?: number;
  truncation?: "auto" | "disabled";
  usage?: boolean;
  user?: string;
}

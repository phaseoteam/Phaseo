export interface InteractionsRequest {
  background?: boolean;
  cached_content?: string;
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  echo_upstream_request?: boolean;
  generation_config?: {
    max_output_tokens?: number;
    seed?: number;
    stop_sequences?: string[];
    temperature?: number;
    thinking_level?: "minimal" | "low" | "medium" | "high";
    thinking_summaries?: "none" | "auto";
    top_p?: number;
    [key: string]: unknown;
  };
  input?:
    | string
    | {
        data?: string;
        mime_type?: string;
        text?: string;
        type: "text" | "image" | "audio" | "video" | "document";
        uri?: string;
        [key: string]: unknown;
      }
    | {
        arguments?:
          | string
          | {
              [key: string]: unknown;
            };
        call_id?: string;
        content?:
          | string
          | {
              data?: string;
              mime_type?: string;
              text?: string;
              type: "text" | "image" | "audio" | "video" | "document";
              uri?: string;
              [key: string]: unknown;
            }[];
        id?: string;
        is_error?: boolean;
        name?: string;
        result?:
          | string
          | {
              [key: string]: unknown;
            };
        signature?: string;
        summary?:
          | string
          | {
              data?: string;
              mime_type?: string;
              text?: string;
              type: "text" | "image" | "audio" | "video" | "document";
              uri?: string;
              [key: string]: unknown;
            };
        type:
          | "user_input"
          | "model_output"
          | "thought"
          | "function_call"
          | "function_result";
        [key: string]: unknown;
      }
    | {
        [key: string]: unknown;
      }[]
    | {
        [key: string]: unknown;
      };
  meta?: boolean;
  metadata?: {
    [key: string]: string;
  };
  model: string;
  previous_interaction_id?: string;
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
  response_format?:
    | {
        [key: string]: unknown;
      }
    | {
        [key: string]: unknown;
      }[];
  response_modalities?: "text" | "image" | "audio" | "video" | "document";
  service_tier?: "standard" | "priority" | "flex" | "batch";
  session_id?: string;
  store?: boolean;
  stream?: boolean;
  system_instruction?:
    | string
    | {
        data?: string;
        mime_type?: string;
        text?: string;
        type: "text" | "image" | "audio" | "video" | "document";
        uri?: string;
        [key: string]: unknown;
      }[];
  tool_choice?:
    | string
    | {
        [key: string]: unknown;
      };
  tools?: {
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}

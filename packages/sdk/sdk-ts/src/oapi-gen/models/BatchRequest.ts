export interface BatchRequest {
  completion_window?: string;
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  endpoint?:
    | "/v1/chat/completions"
    | "/v1/responses"
    | "/v1/messages"
    | "/v1/embeddings"
    | "/v1/generateContent";
  input_file_id?: string;
  items?: {
    [key: string]: unknown;
  }[];
  max_tokens?: number;
  metadata?: {
    [key: string]: unknown;
  };
  model?: string;
  prompts?: string[];
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
    [key: string]: {
      [key: string]: unknown;
    };
  };
  requests?: {
    body: {
      [key: string]: unknown;
    };
    custom_id?: string;
    method?: "POST";
    url?: string;
  }[];
  session_id?: string;
  system?: string;
  temperature?: number;
  webhook?: {
    endpoint_id: string;
    events?: string[];
  };
  webhook_endpoint_id?: string;
}

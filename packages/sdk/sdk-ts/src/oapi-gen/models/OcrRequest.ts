export interface OcrRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  echo_upstream_request?: boolean;
  image: string;
  language?: string;
  mistral?: {
    bbox_annotation_format?:
      | string
      | {
          [key: string]: unknown;
        }
      | null;
    confidence_scores_granularity?: "word" | "page" | null;
    document_annotation_format?:
      | string
      | {
          [key: string]: unknown;
        }
      | null;
    document_annotation_prompt?: string | null;
    extract_footer?: boolean;
    extract_header?: boolean;
    image_limit?: number | null;
    image_min_size?: number | null;
    include_blocks?: boolean;
    include_image_base64?: boolean | null;
    pages?: string | number[] | null;
    table_format?: "markdown" | "html";
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
  provider_params?: {
    [key: string]: unknown;
  };
}

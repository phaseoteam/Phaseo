export interface ImagesGenerationRequest {
  background?: "transparent" | "opaque" | "auto";
  complexity?: "low" | "medium" | "high";
  frame_count?: number;
  frame_duration_ms?: number;
  model: string;
  models?: string[];
  moderation?: "auto" | "low";
  n?: number;
  output_compression?: number;
  output_format?: "png" | "jpeg" | "webp" | "gif" | "svg";
  partial_images?: number;
  prompt: string;
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
  quality?: string;
  resolution?: string;
  response_format?: string;
  size?: string;
  stream?: boolean;
  style?: string;
  svg?: {
    model: string;
    reasoning?: {
      effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
    };
  };
  user?: string;
}

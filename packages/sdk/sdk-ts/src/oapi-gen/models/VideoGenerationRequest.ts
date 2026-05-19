export interface VideoGenerationRequest {
  aspect_ratio?: string;
  compression_quality?: number;
  duration?: number;
  enhance_prompt?: boolean;
  generate_audio?: boolean;
  input_references?: {
    image_url?: {
      url: string;
    };
    reference_type?: string;
    role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
    type: "image_url";
  }[];
  model: string;
  negative_prompt?: string;
  output?: {
    access?: "bytes" | "signed_url" | "both";
  };
  person_generation?: string;
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
  provider_params?: {
    [key: string]: unknown;
  };
  resize_mode?: string;
  resolution?: string;
  sample_count?: number;
  seed?: number;
  size?: string;
  webhook?: {
    events?: string[];
    secret?: string;
    url?: string;
  };
}

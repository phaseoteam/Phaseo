export interface VideoGenerationRequest {
  aspect_ratio?: string;
  compression_quality?: number;
  duration?: number;
  enhance_prompt?: boolean;
  frame_images?: {
    frame_type: "first_frame" | "last_frame";
    image_url: {
      url: string;
    };
    type: "image_url";
  }[];
  generate_audio?: boolean;
  input_audio_duration?: number;
  input_references?: (
    | {
        image_url: {
          url: string;
        };
        reference_type?: string;
        role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
        type: "image_url";
      }
    | {
        media_url: {
          url: string;
        };
        reference_type?: string;
        role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
        type: "video_url" | "audio_url";
      }
  )[];
  input_video_duration?: number;
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
  provider_options?: {
    [key: string]: {
      [key: string]: unknown;
    };
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
    endpoint_id: string;
    events?: string[];
  };
}

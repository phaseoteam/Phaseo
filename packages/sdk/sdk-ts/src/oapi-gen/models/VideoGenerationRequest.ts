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
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
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

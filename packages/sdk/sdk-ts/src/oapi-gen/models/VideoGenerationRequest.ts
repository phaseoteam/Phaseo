export interface VideoGenerationRequest {
  aspect_ratio?: string;
  duration?: number;
  duration_seconds?: number;
  enhance_prompt?: boolean;
  generate_audio?: boolean;
  input?: {
    image?: string | {};
    last_frame?: string | {};
    reference_images?: {
      image?: string | {};
      reference_type?: string;
      uri?: string;
      url?: string;
    }[];
    video?: string | {};
  };
  input_image?: string | {};
  input_last_frame?: string | {};
  input_reference?: string;
  input_reference_mime_type?: string;
  input_video?: string | {};
  last_frame?: string | {};
  model: string;
  negative_prompt?: string;
  number_of_videos?: number;
  output_storage_uri?: string;
  person_generation?: string;
  prompt: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  quality?: string;
  ratio?: string;
  reference_images?: {}[];
  resolution?: string;
  sample_count?: number;
  seconds?: number | string;
  seed?: number;
  size?: string;
}

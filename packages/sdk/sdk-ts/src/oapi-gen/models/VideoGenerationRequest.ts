export interface VideoGenerationRequest {
  aspect_ratio?: string;
  duration?: number;
  duration_seconds?: number;
  input_reference?: string;
  input_reference_mime_type?: string;
  model: string;
  negative_prompt?: string;
  output_storage_uri?: string;
  person_generation?: string;
  prompt: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  ratio?: string;
  resolution?: string;
  sample_count?: number;
  seconds?: number | string;
  seed?: number;
  size?: string;
}

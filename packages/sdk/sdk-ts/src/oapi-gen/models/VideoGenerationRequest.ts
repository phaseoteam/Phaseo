export interface VideoGenerationRequest {
  aspect_ratio?: string;
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
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

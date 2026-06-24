export interface ModelEndpointCapability {
  availability_reason?: string;
  availability_status?: string;
  capability_id: string;
  capability_status?: string;
  collection:
    | "text"
    | "images"
    | "videos"
    | "audio"
    | "embeddings"
    | "rerank"
    | "ocr"
    | "music"
    | "batches";
  effective_from?: string | null;
  effective_to?: string | null;
  endpoint: string;
  id: string;
  input_modalities: string[];
  is_active_gateway?: boolean;
  model_routing_status?: string;
  output_modalities: string[];
  params?: string[];
  params_detail?: {
    [key: string]: {
      [key: string]: unknown;
    };
  };
  pricing?: {
    [key: string]: unknown;
  };
  pricing_detail?: {
    [key: string]: unknown;
  };
  provider_id: string;
  provider_model_slug?: string | null;
  provider_name?: string | null;
  provider_routing_status?: string;
  provider_status?: string;
  public_path: string;
  supported_parameters: string[];
  supported_parameters_detail?: {
    [key: string]: {
      [key: string]: unknown;
    };
  };
}

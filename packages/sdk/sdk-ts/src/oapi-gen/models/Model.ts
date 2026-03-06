export interface Model {
  aliases?: string[];
  architecture?: {
    input_modalities?: string[];
    instruct_type?: string | null;
    modality?: string;
    output_modalities?: string[];
    tokenizer?: string | null;
  };
  canonical_slug?: string;
  created?: number | null;
  deprecation_date?: string | null;
  description?: string;
  endpoints?: string[];
  id?: string;
  input_types?: string[];
  model_id?: string;
  name?: string | null;
  organisation_colour?: string | null;
  organisation_id?: string | null;
  organisation_name?: string | null;
  output_types?: string[];
  per_request_limits?: {
    [key: string]: unknown;
  } | null;
  pricing?: {
    completion?: string | null;
    image?: string | null;
    input_cache_read?: string | null;
    input_cache_write?: string | null;
    prompt?: string | null;
    request?: string | null;
    web_search?: string | null;
  };
  pricing_detail?: {
    meters?: {
      [key: string]: unknown;
    };
    pricing_plan?: string;
  };
  providers?: {
    api_provider_id?: string;
    params?: string[];
  }[];
  release_date?: string | null;
  retirement_date?: string | null;
  status?: string | null;
  supported_parameters?: string[];
  supported_params?: string[];
  top_provider?: {
    context_length?: number | null;
    is_moderated?: boolean;
    max_completion_tokens?: number | null;
  };
  top_provider_id?: string | null;
}

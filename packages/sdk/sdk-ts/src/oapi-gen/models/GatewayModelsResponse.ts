export interface GatewayModelsResponse {
  availability_mode: "active" | "all";
  collection?:
    | "text"
    | "images"
    | "videos"
    | "audio"
    | "embeddings"
    | "rerank"
    | "ocr"
    | "music"
    | "batches"
    | null;
  limit: number;
  models: {
    aliases?: string[];
    architecture?: {
      input_modalities?: string[];
      instruct_type?: string | null;
      modality?: string;
      output_modalities?: string[];
      tokenizer?: string | null;
    };
    availability?: {
      active_provider_count: number;
      inactive_provider_count: number;
      provider_count: number;
      status: "active" | "coming_soon" | "inactive" | "not_listed";
    };
    canonical_slug?: string;
    created?: number | null;
    deprecation_date?: string | null;
    description?: string;
    endpoints?: string[];
    id?: string;
    input_types?: string[];
    lifecycle?: {
      deprecation_date?: string | null;
      message?: string | null;
      replacement_model_id?: string | null;
      retirement_date?: string | null;
      status?: "active" | "deprecated" | "retired" | null;
    };
    links?: {
      endpoints?: string;
    };
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
      api_provider_id: string;
      api_provider_name?: string | null;
      availability_reason:
        | "active"
        | "preview_only"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "internal_testing"
        | "scheduled"
        | "coming_soon"
        | "provider_disabled"
        | "model_disabled"
        | "capability_disabled"
        | "provider_not_ready"
        | "provider_inactive"
        | "inactive"
        | "retired";
      availability_status: "active" | "coming_soon" | "inactive";
      capability_status:
        | "active"
        | "coming_soon"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled"
        | "internal_testing";
      effective_from?: string | null;
      effective_to?: string | null;
      endpoints: string[];
      input_modalities?: string[];
      is_active_gateway: boolean;
      model_routing_status:
        | "active"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled";
      output_modalities?: string[];
      params: string[];
      params_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      provider_model_slug?: string | null;
      provider_routing_status:
        | "active"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled";
      provider_status:
        | "active"
        | "beta"
        | "alpha"
        | "not_ready"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked";
      supported_parameters?: string[];
      supported_parameters_detail?: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
    }[];
    release_date?: string | null;
    retirement_date?: string | null;
    status?: string | null;
    supported_parameters?: string[];
    supported_parameters_detail?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    supported_params?: string[];
    supported_params_detail?: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    top_provider?: {
      context_length?: number | null;
      is_moderated?: boolean;
      max_completion_tokens?: number | null;
    };
    top_provider_id?: string | null;
  }[];
  offset: number;
  ok: boolean;
  privacy_scope: "shared" | "team";
  total: number;
}

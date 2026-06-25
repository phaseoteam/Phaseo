export interface ModelProviderAvailability {
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
  is_active_gateway: boolean;
  model_routing_status:
    | "active"
    | "deranked_lvl1"
    | "deranked_lvl2"
    | "deranked_lvl3"
    | "disabled";
  params: string[];
  params_detail?: {
    [key: string]: {
      [key: string]: unknown;
    };
  };
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
}

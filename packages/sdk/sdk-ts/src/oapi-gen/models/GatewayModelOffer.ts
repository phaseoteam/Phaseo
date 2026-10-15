export interface GatewayModelOffer {
  capabilities: {
    endpoints?: string[];
    parameter_details: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    parameters: string[];
  };
  effective: {
    from: string | null;
    to: string | null;
  };
  endpoints: string[];
  modalities: {
    input: string[];
    output: string[];
  };
  model: string | null;
  pricing: {
    meters: {
      [key: string]: {
        currency: "USD";
        price_per_unit: string;
        provider_id: string;
        unit: string;
        unit_size: number;
      } | null;
    };
    pricing_plan: "standard";
  };
  provider: {
    id: string;
    name: string | null;
  };
  routable: boolean;
  routing: {
    capability:
      | "active"
      | "coming_soon"
      | "deranked_lvl1"
      | "deranked_lvl2"
      | "deranked_lvl3"
      | "disabled"
      | "internal_testing";
    model:
      | "active"
      | "deranked_lvl1"
      | "deranked_lvl2"
      | "deranked_lvl3"
      | "disabled";
    provider:
      | "active"
      | "deranked_lvl1"
      | "deranked_lvl2"
      | "deranked_lvl3"
      | "disabled";
  };
  service_tiers?: ("flex" | "priority" | "standard" | "ultrafast")[];
  status: "active" | "coming_soon" | "inactive";
  status_reason:
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
}

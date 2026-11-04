export interface ModelEndpointsResponse {
  availability_mode: "active" | "all";
  description: string;
  endpoints: {
    capabilities: {
      endpoints?: string[];
      parameter_details: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      parameters: string[];
    };
    capability_id: string;
    collection:
      | "text"
      | "images"
      | "video"
      | "audio"
      | "embeddings"
      | "rerank"
      | "moderation"
      | "ocr"
      | "music"
      | "batch"
      | "files";
    effective: {
      from: string | null;
      to: string | null;
    };
    endpoint: string;
    id: string;
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
    public_path: string;
    routable: boolean;
    routing: {
      capability:
        | "active"
        | "coming_soon"
        | "deranked"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled"
        | "internal_testing";
      model:
        | "active"
        | "deranked"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled";
      provider:
        | "active"
        | "deranked"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled";
    };
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
      | "deranked"
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
  }[];
  id: string;
  modalities: {
    input: string[];
    output: string[];
  };
  name: string;
  ok: true;
  organization: {
    color: string | null;
    id: string;
    name: string | null;
  } | null;
}

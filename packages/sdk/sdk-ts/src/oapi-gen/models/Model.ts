export interface Model {
  aliases: string[];
  availability: {
    active_provider_count: number;
    coming_soon_provider_count: number;
    inactive_provider_count: number;
    provider_count: number;
    status: "active" | "coming_soon" | "inactive" | "not_listed";
  };
  base_model_id: string;
  capabilities: {
    endpoints?: string[];
    parameter_details: {
      [key: string]: {
        [key: string]: unknown;
      };
    };
    parameter_specs?: {
      [key: string]: {
        alias_of?: string;
        aliases?: string[];
        always_on?: boolean;
        default?: string | number | boolean;
        dimensions?: {
          aspect_ratios?: string[];
          max?: number;
          max_aspect_ratio?: string;
          max_height?: number;
          max_pixels?: number;
          max_width?: number;
          min?: number;
          min_pixels?: number;
          multiple_of?: number;
        };
        extra?: {
          [key: string]: unknown;
        };
        format?: string;
        formats?: string[];
        item_types?: string[];
        max?: number;
        max_file_size_bytes?: number;
        max_items?: number;
        max_length?: number;
        max_tokens?: number;
        media?: "image" | "audio" | "video";
        min?: number;
        min_items?: number;
        min_length?: number;
        multiple_of?: number;
        notes?: string;
        options?: {
          description?: string;
          label?: string;
          value: string | number | boolean;
          [key: string]: unknown;
        }[];
        properties?: {
          [key: string]: {
            [key: string]: unknown;
          };
        };
        provider_default?: string | number | boolean;
        required?: boolean;
        requires?: string[];
        source?: {
          url?: string;
          verified_at?: string;
        };
        step?: number;
        support_level?: string;
        supported: boolean;
        type?:
          | "string"
          | "integer"
          | "number"
          | "boolean"
          | "array"
          | "object"
          | "file"
          | (
              | "string"
              | "integer"
              | "number"
              | "boolean"
              | "array"
              | "object"
              | "file"
            )[];
        upstream_name?: string;
        upstream_values?: (string | number | boolean)[];
        values?: (string | number | boolean)[];
        when?: {
          default?: string | number | boolean;
          if: {
            [key: string]: (string | number | boolean)[];
          };
          max?: number;
          message?: string;
          min?: number;
          step?: number;
          supported?: boolean;
          values?: (string | number | boolean)[];
        }[];
      };
    };
    parameters: string[];
  };
  description: string;
  id: string;
  lifecycle: {
    deprecated_at: string | null;
    message: string | null;
    released_at: string | null;
    replacement_id: string | null;
    retires_at: string | null;
    status: "active" | "deprecated" | "retired" | null;
  };
  limits: {
    input_tokens: number | null;
    output_tokens: number | null;
  };
  modalities: {
    input: string[];
    output: string[];
  };
  name: string;
  offers: {
    capabilities: {
      endpoints?: string[];
      parameter_details: {
        [key: string]: {
          [key: string]: unknown;
        };
      };
      parameter_specs?: {
        [key: string]: {
          alias_of?: string;
          aliases?: string[];
          always_on?: boolean;
          default?: string | number | boolean;
          dimensions?: {
            aspect_ratios?: string[];
            max?: number;
            max_aspect_ratio?: string;
            max_height?: number;
            max_pixels?: number;
            max_width?: number;
            min?: number;
            min_pixels?: number;
            multiple_of?: number;
          };
          extra?: {
            [key: string]: unknown;
          };
          format?: string;
          formats?: string[];
          item_types?: string[];
          max?: number;
          max_file_size_bytes?: number;
          max_items?: number;
          max_length?: number;
          max_tokens?: number;
          media?: "image" | "audio" | "video";
          min?: number;
          min_items?: number;
          min_length?: number;
          multiple_of?: number;
          notes?: string;
          options?: {
            description?: string;
            label?: string;
            value: string | number | boolean;
            [key: string]: unknown;
          }[];
          properties?: {
            [key: string]: {
              [key: string]: unknown;
            };
          };
          provider_default?: string | number | boolean;
          required?: boolean;
          requires?: string[];
          source?: {
            url?: string;
            verified_at?: string;
          };
          step?: number;
          support_level?: string;
          supported: boolean;
          type?:
            | "string"
            | "integer"
            | "number"
            | "boolean"
            | "array"
            | "object"
            | "file"
            | (
                | "string"
                | "integer"
                | "number"
                | "boolean"
                | "array"
                | "object"
                | "file"
              )[];
          upstream_name?: string;
          upstream_values?: (string | number | boolean)[];
          values?: (string | number | boolean)[];
          when?: {
            default?: string | number | boolean;
            if: {
              [key: string]: (string | number | boolean)[];
            };
            max?: number;
            message?: string;
            min?: number;
            step?: number;
            supported?: boolean;
            values?: (string | number | boolean)[];
          }[];
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
  organization: {
    color: string | null;
    id: string;
    name: string | null;
  } | null;
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
  variant: string;
  variants: {
    [key: string]: {
      model_id: string;
      name: string;
    };
  };
}

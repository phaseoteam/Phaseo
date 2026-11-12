export interface AutoRoutingSettingsResponse {
  data: {
    allow_fallbacks?: boolean;
    allowed_patterns?: string[];
    max_input_price_per_million?: number | null;
    max_output_price_per_million?: number | null;
    objective?: "balanced" | "quality" | "cost" | "latency";
    revision?: string | null;
    spend_profile?:
      "economy" | "standard" | "premium" | "unrestricted" | "custom";
    updated_at?: string | null;
  };
}

export interface AutoRoutingSettingsUpdateRequest {
  allow_fallbacks?: boolean;
  allowed_patterns?: string[];
  max_input_price_per_million?: number | null;
  max_output_price_per_million?: number | null;
  objective?: "balanced" | "quality" | "cost" | "latency";
  spend_profile?:
    "economy" | "standard" | "premium" | "unrestricted" | "custom";
}

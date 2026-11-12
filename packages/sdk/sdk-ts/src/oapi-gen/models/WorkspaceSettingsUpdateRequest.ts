export interface WorkspaceSettingsUpdateRequest {
  alpha_channel_enabled?: boolean;
  beta_channel_enabled?: boolean;
  byok_fallback_enabled?: boolean;
  io_logging_enabled?: boolean;
  io_logging_include_provider_payloads?: boolean;
  model_successor_max_price_increase_percent?: number;
  model_successor_price_policy?: "never" | "limit" | "any";
  model_successor_redirect_enabled?: boolean;
  privacy_enable_free_may_publish_prompts?: boolean;
  privacy_enable_free_may_train?: boolean;
  privacy_enable_input_output_logging?: boolean;
  privacy_enable_paid_may_train?: boolean;
  privacy_zdr_only?: boolean;
  provider_restriction_enforce_allowed?: boolean;
  provider_restriction_mode?: "none" | "allowlist" | "blocklist";
  provider_restriction_provider_ids?: string[];
  response_healing_enabled?: boolean;
  response_healing_locked?: boolean;
  response_healing_mode?: "safe" | "strict";
  routing_mode?: "balanced" | "price" | "latency" | "throughput";
}

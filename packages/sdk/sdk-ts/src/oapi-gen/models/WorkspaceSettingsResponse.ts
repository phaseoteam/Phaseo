export interface WorkspaceSettingsResponse {
  data: {
    alpha_channel_enabled?: boolean | null;
    beta_channel_enabled?: boolean | null;
    byok_fallback_enabled?: boolean | null;
    io_logging_enabled?: boolean | null;
    io_logging_include_provider_payloads?: boolean | null;
    model_successor_max_price_increase_percent?: number | null;
    model_successor_price_policy?: "never" | "limit" | "any" | null;
    model_successor_redirect_enabled?: boolean | null;
    privacy_enable_free_may_publish_prompts?: boolean | null;
    privacy_enable_free_may_train?: boolean | null;
    privacy_enable_input_output_logging?: boolean | null;
    privacy_enable_paid_may_train?: boolean | null;
    privacy_zdr_only?: boolean | null;
    provider_restriction_enforce_allowed?: boolean | null;
    provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    provider_restriction_provider_ids?: string[] | null;
    response_healing_enabled?: boolean | null;
    response_healing_locked?: boolean | null;
    response_healing_mode?: "safe" | "strict" | null;
    routing_mode?: "balanced" | "price" | "latency" | "throughput" | null;
    updated_at?: string | null;
    workspace_id: string;
  };
}

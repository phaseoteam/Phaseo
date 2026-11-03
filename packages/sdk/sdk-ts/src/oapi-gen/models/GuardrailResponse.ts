export interface GuardrailResponse {
  data: {
    allowed_api_model_ids?: string[] | null;
    created_at?: string | null;
    description?: string | null;
    enabled?: boolean | null;
    id: string;
    model_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    name: string;
    privacy_enable_free_may_publish_prompts?: boolean | null;
    privacy_enable_free_may_train?: boolean | null;
    privacy_enable_input_output_logging?: boolean | null;
    privacy_enable_paid_may_train?: boolean | null;
    privacy_zdr_only?: boolean | null;
    prompt_injection_action?: "flag" | "block" | null;
    prompt_injection_enabled?: boolean | null;
    provider_restriction_enforce_allowed?: boolean | null;
    provider_restriction_mode?: "none" | "allowlist" | "blocklist" | null;
    provider_restriction_provider_ids?: string[] | null;
    sensitive_info_default_action?: "flag" | "redact" | "block" | null;
    sensitive_info_enabled?: boolean | null;
    sensitive_info_rules?:
      | {
          [key: string]: unknown;
        }[]
      | null;
    updated_at?: string | null;
    workspace_id: string;
  };
}

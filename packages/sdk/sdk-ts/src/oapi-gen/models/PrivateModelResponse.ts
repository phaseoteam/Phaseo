export interface PrivateModelResponse {
  data: {
    base_url: string;
    catalog_model_id?: string | null;
    context_length?: number | null;
    created_at?: string | null;
    created_by?: string | null;
    credential_prefix?: string | null;
    credential_suffix?: string | null;
    custom_provider_name?: string | null;
    custom_provider_url?: string | null;
    description?: string | null;
    enabled: boolean;
    host_provider_id?: string | null;
    id: string;
    input_modalities?: string[];
    local_slug?: string;
    max_output_tokens?: number | null;
    model_id: string;
    name: string;
    output_modalities?: string[];
    routing_policy?: "preferred" | "balanced" | "fallback";
    supports_responses: boolean;
    updated_at?: string | null;
    upstream_model_id: string;
    workspace_id: string;
  };
}

export interface PrivateModelUpdateRequest {
  base_url?: string;
  context_length?: number | null;
  credential?: string;
  custom_provider_name?: string | null;
  custom_provider_url?: string | null;
  description?: string | null;
  enabled?: boolean;
  host_provider_id?: string | null;
  max_output_tokens?: number | null;
  model_reference?: string;
  name?: string;
  routing_policy?: "preferred" | "balanced" | "fallback";
  supports_responses?: boolean;
  upstream_model_id?: string;
}

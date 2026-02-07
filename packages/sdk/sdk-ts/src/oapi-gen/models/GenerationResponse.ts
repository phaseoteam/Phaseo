export interface GenerationResponse {
  app_id?: string | null;
  byok?: boolean;
  cost_nanos?: number;
  currency?: string;
  endpoint?: string;
  error_code?: string | null;
  error_message?: string | null;
  generation_ms?: number;
  key_id?: string;
  latency_ms?: number;
  model_id?: string;
  native_response_id?: string | null;
  pricing_lines?: {}[];
  provider?: string;
  request_id?: string;
  status_code?: number;
  stream?: boolean;
  success?: boolean;
  team_id?: string;
  throughput?: number | null;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  } | null;
}

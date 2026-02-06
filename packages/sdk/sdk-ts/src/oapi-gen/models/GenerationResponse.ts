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
    cached_read_text_tokens?: number;
    cached_write_text_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: {
      cached_tokens?: number;
      input_audio?: number;
      input_images?: number;
      input_videos?: number;
      output_audio?: number;
      output_images?: number;
      output_videos?: number;
      reasoning_tokens?: number;
    };
    input_text_tokens?: number;
    input_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
      input_audio?: number;
      input_images?: number;
      input_videos?: number;
      output_audio?: number;
      output_images?: number;
      output_videos?: number;
      reasoning_tokens?: number;
    };
    output_text_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: {
      cached_tokens?: number;
      input_audio?: number;
      input_images?: number;
      input_videos?: number;
      output_audio?: number;
      output_images?: number;
      output_videos?: number;
      reasoning_tokens?: number;
    };
    pricing?: {
      currency?: string;
      lines?: {
        [key: string]: unknown;
      }[];
      total_cents?: number;
      total_nanos?: number;
      total_usd_str?: string;
    };
    pricing_breakdown?: {
      currency?: string;
      lines?: {
        [key: string]: unknown;
      }[];
      total_cents?: number;
      total_nanos?: number;
      total_usd_str?: string;
    };
    prompt_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      input_audio?: number;
      input_images?: number;
      input_videos?: number;
      output_audio?: number;
      output_images?: number;
      output_videos?: number;
      reasoning_tokens?: number;
    };
    reasoning_tokens?: number;
    total_tokens?: number;
  };
  [key: string]: unknown;
}

export interface ResponsesResponse {
  background?: boolean | null;
  completed_at?: number | null;
  created_at?: number;
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: {
      [key: string]: unknown;
    }[];
    trace_level?: "summary" | "full";
  };
  error?: {} | null;
  frequency_penalty?: number | null;
  id?: string;
  incomplete_details?: {} | null;
  instructions?: string | null;
  max_output_tokens?: number | null;
  max_tool_calls?: number | null;
  meta?: {};
  metadata?: {};
  model?: string;
  nativeResponseId?: string;
  object?: string;
  output?: {
    arguments?: string;
    call_id?: string;
    content?: {
      annotations?: {}[];
      b64_json?: string;
      image_url?: {
        url?: string;
      };
      mime_type?: string;
      text?: string;
      type?: "output_text" | "output_image";
      [key: string]: unknown;
    }[];
    id?: string;
    name?: string;
    role?: string;
    status?: string;
    type?: string;
    [key: string]: unknown;
  }[];
  parallel_tool_calls?: boolean;
  presence_penalty?: number | null;
  previous_response_id?: string | null;
  prompt_cache_key?: string | null;
  reasoning?: {
    effort?: string | null;
    summary?: string | null;
  };
  safety_identifier?: string | null;
  service_tier?: string | null;
  status?: string;
  store?: boolean | null;
  temperature?: number | null;
  text?: {} | null;
  tool_choice?: string | {};
  tools?: {}[];
  top_logprobs?: number | null;
  top_p?: number | null;
  truncation?: string;
  upstream_request?: {} | string;
  upstream_response?: {} | string;
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
  user?: string | null;
}

/**
 * Server-Sent Event wrapper. Wire format is `event: <optional>\ndata: <json>\n\n`.
 * Most Chat Completions streams only send data lines.
 *
 */
export interface ChatCompletionsStreamEvent {
  data?: {
    choices?: {
      delta?: {
        content?: string;
        reasoning_content?: string;
        role?: string;
        tool_calls?: {
          [key: string]: unknown;
        }[];
        [key: string]: unknown;
      };
      finish_reason?: string;
      index?: number;
      logprobs?: {};
      [key: string]: unknown;
    }[];
    created?: number;
    id?: string;
    meta?: {};
    model?: string;
    nativeResponseId?: string;
    object?: "chat.completion.chunk";
    service_tier?: string;
    system_fingerprint?: string;
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
  };
  event?: string | null;
  [key: string]: unknown;
}

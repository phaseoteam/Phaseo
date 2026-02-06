export interface ChatCompletionsResponse {
  choices?: {
    finish_reason?: "stop" | "length" | "tool_calls" | "content_filter";
    index?: number;
    logprobs?: {};
    message?: {
      content?:
        | string
        | {
            cache_control?: {
              cache?: {
                ttl?: "5m" | "1h";
                type?: "ehpemeral" | "ephemeral";
              };
              ttl?: "5m" | "1h";
              type?: "ehpemeral" | "ephemeral";
            };
            text: string;
            type: "text";
          }
        | {
            cache_control?: {
              cache?: {
                ttl?: "5m" | "1h";
                type?: "ehpemeral" | "ephemeral";
              };
              ttl?: "5m" | "1h";
              type?: "ehpemeral" | "ephemeral";
            };
            text: string;
            type: "input_text";
          }
        | {
            image_url: {
              url?: string;
            };
            type: "image_url";
          }
        | {
            image_url:
              | string
              | {
                  url?: string;
                };
            type: "input_image";
          }
        | {
            input_audio: {
              data?: string;
              format?:
                | "wav"
                | "mp3"
                | "flac"
                | "m4a"
                | "ogg"
                | "pcm16"
                | "pcm24";
            };
            type: "input_audio";
          }
        | {
            type: "input_video";
            video_url: string;
          }
        | {
            function: {
              arguments?: string;
              name?: string;
            };
            id: string;
            type: "tool_call";
          }[];
      name?: string;
      reasoning_content?: string;
      role: "system" | "user" | "assistant" | "tool";
      tool_call_id?: string;
      tool_calls?: {
        function: {
          arguments?: string;
          description?: string;
          name?: string;
          parameters?: {};
        };
        id: string;
        type: "function";
      }[];
    };
  }[];
  created?: number;
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: {
      [key: string]: unknown;
    }[];
    trace_level?: "summary" | "full";
  };
  id?: string;
  meta?: {};
  model?: string;
  nativeResponseId?: string;
  object?: string;
  service_tier?: string;
  system_fingerprint?: string;
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
}

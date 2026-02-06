export interface AnthropicMessagesResponse {
  content?: {
    cache_control?: {
      cache?: {
        ttl?: "5m" | "1h";
        type?: "ehpemeral" | "ephemeral";
      };
      ttl?: "5m" | "1h";
      type?: "ehpemeral" | "ephemeral";
    };
    content?: string;
    id?: string;
    image_url?:
      | string
      | {
          url?: string;
        };
    input?: {};
    input_audio?: {
      data?: string;
      format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
    };
    name?: string;
    source?: {
      data?: string;
      media_type?: string;
      type?: string;
      url?: string;
    };
    text?: string;
    tool_use_id?: string;
    type?:
      | "text"
      | "input_text"
      | "image"
      | "input_image"
      | "input_audio"
      | "input_video"
      | "tool_use"
      | "tool_result";
    video_url?: string;
  }[];
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
  role?: "assistant";
  stop_reason?: string;
  stop_sequence?: string;
  type?: string;
  usage?: {
    cache_creation?: {};
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    server_tool_use?: boolean;
    service_tier?: string;
  };
}

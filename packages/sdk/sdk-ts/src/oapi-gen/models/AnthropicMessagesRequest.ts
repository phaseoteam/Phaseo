export interface AnthropicMessagesRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  max_tokens: number;
  messages: {
    content:
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
    role: "user" | "assistant";
  }[];
  meta?: boolean;
  metadata?: {
    [key: string]: string;
  };
  modalities?: "text" | "image" | "audio" | "video"[];
  model: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
  stop_sequences?: string[];
  stream?: boolean;
  system?: string | {}[];
  temperature?: number;
  tool_choice?: string | {};
  tools?: {
    description?: string;
    input_schema?: {};
    name: string;
  }[];
  top_k?: number;
  top_p?: number;
}

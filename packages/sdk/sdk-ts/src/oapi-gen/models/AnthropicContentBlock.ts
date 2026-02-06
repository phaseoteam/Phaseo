export interface AnthropicContentBlock {
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
}

export interface ChatMessage {
  audio?: {
    data?: string;
    expires_at?: number;
    id?: string;
    transcript?: string;
  };
  audios?: {
    audio_url: {
      url: string;
    };
    format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
    mime_type?: string;
    type: "audio_url";
  }[];
  content?:
    | string
    | null
    | (
        | {
            cache_control?: {
              scope?: string;
              ttl?: string;
              type?: string;
              [key: string]: unknown;
            };
            prompt_cache_breakpoint?: {
              mode?: "explicit";
              ttl?: string;
              [key: string]: unknown;
            };
            text: string;
            type: "text";
          }
        | {
            image_url: {
              url?: string;
            };
            type: "image_url";
          }
        | {
            input_audio: {
              data?: string;
              format?:
                "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
            };
            type: "input_audio";
          }
        | {
            type: "input_video";
            video_url: string;
          }
        | {
            cache_control?: {
              scope?: string;
              ttl?: string;
              type?: string;
              [key: string]: unknown;
            };
            file: {
              file_data?: string;
              file_id?: string;
              filename?: string;
            };
            type: "file";
          }
        | {
            function: {
              arguments?: string;
              name?: string;
            };
            id: string;
            type: "tool_call";
          }
      )[];
  images?: {
    image_url: {
      url: string;
    };
    mime_type?: string;
    type: "image_url";
  }[];
  name?: string;
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: {
    data?: string;
    format?: string;
    id?: string;
    index?: number;
    signature?: string;
    summary?: string;
    text?: string;
    type: "reasoning.text" | "reasoning.summary" | "reasoning.encrypted";
  }[];
  role: "system" | "developer" | "user" | "assistant" | "tool";
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
}

export interface ChatMessage {
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
    | {
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
          format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
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
  images?: {
    image_url: {
      url: string;
    };
    mime_type?: string;
    type: "image_url";
  }[];
  name?: string;
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

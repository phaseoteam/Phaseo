export type MessageContentPart =
  | {
      cache_control?: {
        scope?: string;
        ttl?: string;
        type?: string;
        [key: string]: unknown;
      };
      prompt_cache_breakpoint?: {
        mode?: "explicit";
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
        format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
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
    };

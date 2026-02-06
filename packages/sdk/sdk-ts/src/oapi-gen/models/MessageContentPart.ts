export type MessageContentPart =
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
    };

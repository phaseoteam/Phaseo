export type MessageContentPart =
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
    };

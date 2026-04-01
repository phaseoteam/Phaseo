export type ResponsesOutputContentPart =
  | {
      annotations?: {}[];
      text: string;
      type: "output_text";
    }
  | {
      b64_json?: string;
      image_url?: {
        url?: string;
      };
      mime_type?: string;
      type: "output_image";
    }
  | {
      audio_url?: {
        url?: string;
      };
      b64_json?: string;
      format?: "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16" | "pcm24";
      mime_type?: string;
      type: "output_audio";
    };

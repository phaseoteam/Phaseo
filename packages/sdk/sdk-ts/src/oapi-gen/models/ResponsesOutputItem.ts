/**
 * Responses API output item.
 */
export interface ResponsesOutputItem {
  arguments?: string;
  call_id?: string;
  content?: (
    | {
        annotations?: {}[];
        text: string;
        type: "output_text";
      }
    | {
        text: string;
        type: "reasoning_text";
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
      }
  )[];
  encrypted_content?: string;
  id?: string;
  name?: string;
  role?: string;
  summary?: {
    text: string;
    type: "summary_text";
  }[];
  type?: string;
}

export interface ResponsesResponse {
  content?: {}[];
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  output?: {
    arguments?: string;
    call_id?: string;
    content?:
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
        }[];
    name?: string;
    role?: string;
    type?: string;
  }[];
  output_items?: {
    arguments?: string;
    call_id?: string;
    content?:
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
        }[];
    name?: string;
    role?: string;
    type?: string;
  }[];
  role?: string;
  stop_reason?: string;
  type?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    server_tool_use?: {
      apply_patch_requests?: number;
      datetime_requests?: number;
      fusion_requests?: number;
      image_generation_requests?: number;
      tool_search_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}

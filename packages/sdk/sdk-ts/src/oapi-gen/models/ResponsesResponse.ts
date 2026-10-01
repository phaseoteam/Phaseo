export interface ResponsesResponse {
  content?: {}[];
  cost_cents?: number;
  cost_nanos?: number;
  created?: number;
  currency?: string;
  finish_reason?: string | null;
  id?: string;
  incomplete_details?: {
    reason: "max_output_tokens" | "content_filter";
  } | null;
  meta?: {
    [key: string]: unknown;
  };
  model?: string;
  nativeResponseId?: string | null;
  object?: string;
  output?: {
    arguments?: string;
    call_id?: string;
    content?: (
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
        }
    )[];
    name?: string;
    role?: string;
    type?: string;
  }[];
  output_items?: {
    arguments?: string;
    call_id?: string;
    content?: (
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
        }
    )[];
    name?: string;
    role?: string;
    type?: string;
  }[];
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  provider?: string;
  provider_id?: string;
  role?: string;
  status?: "completed" | "failed" | "incomplete";
  stop_reason?: string;
  type?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    server_tool_use?: {
      advisor_requests?: number;
      apply_patch_requests?: number;
      datetime_requests?: number;
      fusion_requests?: number;
      image_generation_requests?: number;
      search_models_requests?: number;
      subagent_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}

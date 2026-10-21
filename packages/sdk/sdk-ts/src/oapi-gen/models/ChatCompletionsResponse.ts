export interface ChatCompletionsResponse {
  choices?: {
    finish_reason?: "stop" | "length" | "tool_calls" | "content_filter";
    index?: number;
    message?: {
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
    };
  }[];
  created?: number;
  id?: string;
  model?: string;
  nativeResponseId?: string | null;
  object?: string;
  provider?: string;
  usage?: {
    completion_tokens?: number;
    cost?: number;
    cost_details?: {
      upstream_inference_cost?: number | null;
    };
    input_tokens?: number;
    input_tokens_details?: {
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_12h_tokens?: number;
        ttl_30m_tokens?: number;
      };
      cached_tokens?: number;
    };
    output_tokens?: number;
    prompt_tokens?: number;
    prompt_tokens_details?: {
      cache_write_tokens?: number;
      cache_write_tokens_details?: {
        ttl_12h_tokens?: number;
        ttl_30m_tokens?: number;
      };
      cached_tokens?: number;
    };
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

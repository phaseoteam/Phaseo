export interface ChatCompletionsRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  echo_upstream_request?: boolean;
  frequency_penalty?: number;
  image_config?: {
    aspect_ratio?: string;
    font_inputs?: {
      font_url?: string;
      text?: string;
    }[];
    image_size?: "0.5K" | "1K" | "2K" | "4K";
    include_rai_reason?: boolean;
    reference_images?: {
      [key: string]: unknown;
    }[];
    super_resolution_references?: string[];
    [key: string]: unknown;
  };
  logit_bias?: {
    [key: string]: number;
  };
  logprobs?: boolean;
  max_completion_tokens?: number;
  max_tokens?: number;
  max_tool_calls?: number;
  messages: {
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
  }[];
  meta?: boolean;
  metadata?: {
    [key: string]: string;
  };
  modalities?: string[];
  model: string;
  parallel_tool_calls?: boolean;
  presence_penalty?: number;
  prompt_cache_key?: string | null;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  provider_options?: {
    anthropic?: {
      cache_control?: {
        scope?: string;
        ttl?: string;
        type?: string;
        [key: string]: unknown;
      };
    };
    google?: {
      cache_control?: {
        scope?: string;
        ttl?: string;
        type?: string;
        [key: string]: unknown;
      };
      cache_ttl?: string;
      cached_content?: string;
    };
    openai?: {
      context_management?: {
        compact_threshold?: number;
        type: "compaction";
      };
      prompt_cache_retention?: string;
    };
  };
  reasoning?: {
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    enabled?: boolean;
    max_tokens?: number;
    summary?: "auto" | "concise" | "detailed";
  };
  response_format?:
    | string
    | {
        schema?: {};
        type?: string;
      };
  safety_identifier?: string | null;
  seed?: number;
  service_tier?: "auto" | "default" | "flex" | "standard" | "priority";
  stop?: string | string[];
  store?: boolean;
  stream?: boolean;
  stream_options?: {};
  temperature?: number;
  tool_choice?: string | {};
  tools?: {
    type?: "function";
  }[];
  top_logprobs?: number;
  top_p?: number;
  usage?: boolean;
  user?: string;
  user_id?: string;
}

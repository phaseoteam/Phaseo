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
  }[];
  meta?: boolean;
  metadata?: {
    [key: string]: string;
  };
  modalities?: "text" | "image" | "audio"[];
  model: string;
  parallel_tool_calls?: boolean;
  presence_penalty?: number;
  prompt_cache_key?: string | null;
  provider?:
    | "openai"
    | "anthropic"
    | "google-ai-studio"
    | "gemini"
    | "mistral"
    | "x-ai"
    | "xai"
    | "groq"
    | "together"
    | {
        allow_fallbacks?: boolean | null;
        data_collection?: "allow" | "deny" | null;
        enforce_distillable_text?: boolean | null;
        ignore?: string[];
        include_alpha?: boolean;
        max_price?: {
          audio?: number | string;
          completion?: number | string;
          image?: number | string;
          prompt?: number | string;
          request?: number | string;
        };
        only?: string[];
        order?: string[];
        preferred_max_latency?:
          | number
          | {
              [key: string]: number;
            };
        preferred_min_throughput?:
          | number
          | {
              [key: string]: number;
            };
        quantizations?: string[] | null;
        require_parameters?: boolean | null;
        require_zero_data_retention?: boolean | null;
        required_data_region?: string | null;
        required_execution_region?: string | null;
        sort?:
          | string
          | {
              [key: string]: unknown;
            };
        zdr?: boolean | null;
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
  service_tier?: "standard" | "priority" | "flex" | "batch";
  session_id?: string;
  stop?: string | string[];
  store?: boolean;
  stream?: boolean;
  stream_options?: {};
  temperature?: number;
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | "gateway:datetime"
    | "gateway:web_search"
    | "gateway:web_fetch"
    | {};
  tools?:
    | {
        function: {
          description?: string;
          name: string;
          parameters: {};
        };
        type: "function";
        [key: string]: unknown;
      }
    | {
        parameters?: {
          timezone?: string;
        };
        timezone?: string;
        type: "gateway:datetime";
      }
    | {
        include_highlights?: boolean;
        include_text?: boolean;
        max_results?: number;
        parameters?: {
          include_highlights?: boolean;
          include_text?: boolean;
          max_results?: number;
        };
        type: "gateway:web_search";
      }
    | {
        max_chars?: number;
        parameters?: {
          max_chars?: number;
        };
        type: "gateway:web_fetch";
      }[];
  top_logprobs?: number;
  top_p?: number;
  usage?: boolean;
  user?: string;
  user_id?: string;
}

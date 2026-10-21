/**
 * An optional top-level field sent as `null` is treated as unset, the same as leaving it out.
 */
export interface ChatCompletionsRequest {
  cache_control?: {
    scope?: string;
    ttl?: string;
    type?: string;
    [key: string]: unknown;
  };
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
  include_reasoning?: boolean;
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
  }[];
  meta?: boolean;
  metadata?: {
    [key: string]: string;
  };
  modalities?: ("text" | "image" | "audio")[];
  model: string;
  models?: string[];
  parallel_tool_calls?: boolean;
  plugins?: (
    | {
        enabled?: boolean;
        engine?:
          | "auto"
          | "native"
          | "exa"
          | "firecrawl"
          | "parallel"
          | "perplexity"
          | "tinyfish";
        exclude_domains?: string[];
        id: "web";
        include_domains?: string[];
        max_results?: number;
        max_uses?: number;
        search_context_size?: "low" | "medium" | "high";
      }
    | {
        allowed_domains?: string[];
        blocked_domains?: string[];
        enabled?: boolean;
        engine?:
          "auto" | "native" | "direct" | "exa" | "firecrawl" | "parallel";
        id: "web-fetch";
        max_content_tokens?: number;
        max_uses?: number;
      }
    | {
        enabled?: boolean;
        id: "response-healing";
        mode?: "safe" | "strict";
      }
  )[];
  prediction?: {
    content:
      | string
      | {
          [key: string]: unknown;
        }[];
    type: "content";
  };
  presence_penalty?: number;
  prompt?: {
    id: string;
    variables?: {
      [key: string]: unknown;
    };
  };
  prompt_cache_key?: string | null;
  prompt_cache_options?: {
    mode?: "implicit" | "explicit";
    ttl?: string;
    [key: string]: unknown;
  };
  prompt_cache_retention?: "in_memory" | "24h";
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
      prompt_cache_options?: {
        mode?: "implicit" | "explicit";
        ttl?: string;
        [key: string]: unknown;
      };
      prompt_cache_retention?: string;
    };
    xai?: {
      conversation_id?: string;
    };
  };
  reasoning?: {
    effort?:
      | "none"
      | "instant"
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | "xhigh"
      | "max"
      | null;
    enabled?: boolean;
    max_tokens?: number;
    mode?: "standard" | "pro";
    summary?: "auto" | "concise" | "detailed";
  };
  reasoning_effort?:
    | "none"
    | "instant"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";
  response_format?:
    | string
    | {
        schema?: {};
        type?: string;
      };
  safety_identifier?: string | null;
  seed?: number;
  service_tier?:
    | "standard"
    | "default"
    | "fast"
    | "ultrafast"
    | "priority"
    | "flex"
    | "batch"
    | "auto"
    | "scale"
    | null;
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
    | "phaseo:datetime"
    | "phaseo:web_search"
    | "phaseo:web_fetch"
    | "phaseo:subagent"
    | "phaseo:fusion"
    | "phaseo:search_models"
    | "gateway:datetime"
    | "gateway:web_search"
    | "gateway:web_fetch"
    | {};
  tools?: (
    | {
        async?: boolean;
        cache_control?: {
          scope?: string;
          ttl?: string;
          type?: string;
          [key: string]: unknown;
        };
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
        type: "phaseo:datetime" | "gateway:datetime";
      }
    | {
        engine?:
          | "auto"
          | "native"
          | "exa"
          | "firecrawl"
          | "parallel"
          | "perplexity"
          | "tinyfish";
        include_highlights?: boolean;
        include_text?: boolean;
        language?: string;
        max_results?: number;
        page?: number;
        parameters?: {
          engine?:
            | "auto"
            | "native"
            | "exa"
            | "firecrawl"
            | "parallel"
            | "perplexity"
            | "tinyfish";
          include_highlights?: boolean;
          include_text?: boolean;
          language?: string;
          max_results?: number;
          page?: number;
        };
        type: "phaseo:web_search" | "gateway:web_search";
      }
    | {
        max_chars?: number;
        parameters?: {
          max_chars?: number;
        };
        type: "phaseo:web_fetch" | "gateway:web_fetch";
      }
    | {
        parameters?: {
          [key: string]: unknown;
        };
        type: "phaseo:subagent";
      }
    | {
        parameters?: {
          analysis_models: string[];
          model?: string;
          [key: string]: unknown;
        };
        type: "phaseo:fusion";
      }
    | {
        parameters?: {
          max_results?: number;
        };
        type: "phaseo:search_models";
      }
    | {
        filters?: {
          allowed_domains?: string[];
        };
        search_context_size?: "low" | "medium" | "high";
        type:
          | "web_search"
          | "web_search_2025_08_26"
          | "web_search_preview"
          | "web_search_preview_2025_03_11";
        user_location?: {
          [key: string]: unknown;
        };
        [key: string]: unknown;
      }
  )[];
  top_logprobs?: number;
  top_p?: number;
  usage?: boolean;
  user?: string;
  user_id?: string;
}

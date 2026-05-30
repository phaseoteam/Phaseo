import type { Client } from "../../runtime/client.js";

export type CalculatePricingParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    endpoint: string;
    model: string;
    provider: string;
    usage: {
      [key: string]: unknown;
    };
  };
};

/**
 * Calculates price for a usage payload.
 */
export async function calculatePricing(
  client: Client,
  args: CalculatePricingParams = {},
): Promise<{
  ok?: boolean;
  pricing?: {
    [key: string]: unknown;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/pricing/calculate";
  return client.request<{
    ok?: boolean;
    pricing?: {
      [key: string]: unknown;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CancelBatchParams = {
  path?: {
    batch_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Cancels a batch request.
 */
export async function cancelBatch(
  client: Client,
  args: CancelBatchParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/batches/${encodeURIComponent(String(path?.batch_id))}/cancel`;
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CancelBatchAliasParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /batches/{batch_id}/cancel.
 */
export async function cancelBatchAlias(
  client: Client,
  args: CancelBatchAliasParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/batch/${encodeURIComponent(String(path?.id))}/cancel`;
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CancelVideoParams = {
  path?: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Temporarily disabled while provider-level cancellation support is standardized.
 */
export async function cancelVideo(
  client: Client,
  args: CancelVideoParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/videos/${encodeURIComponent(String(path?.video_id))}/cancel`;
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CancelVideoAliasParams = {
  path?: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos/{video_id}/cancel (currently disabled).
 */
export async function cancelVideoAlias(
  client: Client,
  args: CancelVideoAliasParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path?.video_id))}/cancel`;
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateAnthropicMessageParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    echo_upstream_request?: boolean;
    max_tokens: number;
    messages: {
      content:
        | string
        | {
            cache_control?: {
              scope?: string;
              ttl?: string;
              type?: string;
              [key: string]: unknown;
            };
            content?: string;
            id?: string;
            input?: {};
            name?: string;
            source?: {
              data?: string;
              media_type?: string;
              type?: string;
              url?: string;
            };
            text?: string;
            tool_use_id?: string;
            type?: "text" | "image" | "tool_use" | "tool_result";
          }[];
      role: "user" | "assistant";
    }[];
    meta?: boolean;
    metadata?: {
      [key: string]: unknown;
    };
    model: string;
    provider?: {
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
    session_id?: string;
    stop_sequences?: string[];
    stream?: boolean;
    system?:
      | string
      | {
          cache_control?: {
            scope?: string;
            ttl?: string;
            type?: string;
            [key: string]: unknown;
          };
          text?: string;
          type?: "text";
        }[];
    temperature?: number;
    tool_choice?: {} | string;
    tools?:
      | {
          description?: string;
          input_schema?: {};
          name: string;
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
    top_k?: number;
    top_p?: number;
    usage?: boolean;
  };
};

/**
 * Creates a message using the Anthropic Messages API.
 */
export async function createAnthropicMessage(
  client: Client,
  args: CreateAnthropicMessageParams = {},
): Promise<{
  content?: {
    cache_control?: {
      scope?: string;
      ttl?: string;
      type?: string;
      [key: string]: unknown;
    };
    content?: string;
    id?: string;
    input?: {};
    name?: string;
    source?: {
      data?: string;
      media_type?: string;
      type?: string;
      url?: string;
    };
    text?: string;
    tool_use_id?: string;
    type?: "text" | "image" | "tool_use" | "tool_result";
  }[];
  id?: string;
  model?: string;
  role?: "assistant";
  stop_reason?: string;
  stop_sequence?: string;
  type?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/messages";
  return client.request<{
    content?: {
      cache_control?: {
        scope?: string;
        ttl?: string;
        type?: string;
        [key: string]: unknown;
      };
      content?: string;
      id?: string;
      input?: {};
      name?: string;
      source?: {
        data?: string;
        media_type?: string;
        type?: string;
        url?: string;
      };
      text?: string;
      tool_use_id?: string;
      type?: "text" | "image" | "tool_use" | "tool_result";
    }[];
    id?: string;
    model?: string;
    role?: "assistant";
    stop_reason?: string;
    stop_sequence?: string;
    type?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateApiKeyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    disabled?: boolean;
    expires_at?: string | null;
    include_byok_in_limit?: boolean;
    limit?: number | null;
    limit_reset?: "daily" | "weekly" | "monthly";
    name: string;
    scopes?: string | string[];
    soft_blocked?: boolean;
    workspace_id?: string;
  };
};

/**
 * Creates a new API key in the authenticated workspace. Management API key required.
 */
export async function createApiKey(
  client: Client,
  args: CreateApiKeyParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    key: string;
    label: string | null;
    last_used_at: string | null;
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    updated_at: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/keys";
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      key: string;
      label: string | null;
      last_used_at: string | null;
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      updated_at: string | null;
      workspace_id: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateBatchParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    completion_window?: string;
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    endpoint: string;
    input_file_id: string;
    metadata?: {
      [key: string]: unknown;
    };
    provider?: {
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
    session_id?: string;
    webhook?: {
      events?: string[];
      secret?: string;
      url?: string;
    };
  };
};

/**
 * Creates an async batch job and returns the upstream batch object. The gateway also accepts `session_id` and `webhook` for observability and async notifications.
 */
export async function createBatch(
  client: Client,
  args: CreateBatchParams = {},
): Promise<{
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number;
    cost_usd?: number;
    finalized_at?: string;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
  };
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  metadata?: {};
  object?: string;
  output_file_id?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  session_id?: string;
  status?: string;
  webhook?: {
    events?: string[];
    secret?: string;
    url?: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batches";
  return client.request<{
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number;
      cost_usd?: number;
      finalized_at?: string;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
    };
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    metadata?: {};
    object?: string;
    output_file_id?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    session_id?: string;
    status?: string;
    webhook?: {
      events?: string[];
      secret?: string;
      url?: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateBatchAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    completion_window?: string;
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    endpoint: string;
    input_file_id: string;
    metadata?: {
      [key: string]: unknown;
    };
    provider?: {
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
    session_id?: string;
    webhook?: {
      events?: string[];
      secret?: string;
      url?: string;
    };
  };
};

/**
 * Alias of /batches.
 */
export async function createBatchAlias(
  client: Client,
  args: CreateBatchAliasParams = {},
): Promise<{
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number;
    cost_usd?: number;
    finalized_at?: string;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
  };
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  metadata?: {};
  object?: string;
  output_file_id?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  session_id?: string;
  status?: string;
  webhook?: {
    events?: string[];
    secret?: string;
    url?: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batch";
  return client.request<{
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number;
      cost_usd?: number;
      finalized_at?: string;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
    };
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    metadata?: {};
    object?: string;
    output_file_id?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    session_id?: string;
    status?: string;
    webhook?: {
      events?: string[];
      secret?: string;
      url?: string;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateChatCompletionParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
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
              format?:
                | "wav"
                | "mp3"
                | "flac"
                | "m4a"
                | "ogg"
                | "pcm16"
                | "pcm24";
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
    provider?: {
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
    service_tier?: "auto" | "default" | "flex" | "standard" | "priority";
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
  };
};

/**
 * Creates a completion for the chat message.
 */
export async function createChatCompletion(
  client: Client,
  args: CreateChatCompletionParams = {},
): Promise<{
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
              format?:
                | "wav"
                | "mp3"
                | "flac"
                | "m4a"
                | "ogg"
                | "pcm16"
                | "pcm24";
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
    prompt_tokens?: number;
    server_tool_use?: {
      datetime_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/chat/completions";
  return client.request<{
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
                format?:
                  | "wav"
                  | "mp3"
                  | "flac"
                  | "m4a"
                  | "ogg"
                  | "pcm16"
                  | "pcm24";
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
      prompt_tokens?: number;
      server_tool_use?: {
        datetime_requests?: number;
        web_fetch_requests?: number;
        web_search_requests?: number;
      };
      total_tokens?: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateEmbeddingParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    dimensions?: number;
    encoding_format?: "float" | "base64";
    input:
      | string
      | number[]
      | {
          content:
            | {
                text: string;
                type: "text" | "input_text";
              }
            | {
                image_url?:
                  | string
                  | {
                      url: string;
                    };
                type: "image_url" | "input_image" | "image";
                url?:
                  | string
                  | {
                      url: string;
                    };
              }
            | {
                input_audio: {
                  data?: string;
                  format?: string;
                  url?: string;
                };
                type: "input_audio";
              }
            | {
                type: "input_video" | "video_url";
                url?:
                  | string
                  | {
                      url: string;
                    };
                video_url?:
                  | string
                  | {
                      url: string;
                    };
              }[];
        }
      | string
      | number[]
      | {
          content:
            | {
                text: string;
                type: "text" | "input_text";
              }
            | {
                image_url?:
                  | string
                  | {
                      url: string;
                    };
                type: "image_url" | "input_image" | "image";
                url?:
                  | string
                  | {
                      url: string;
                    };
              }
            | {
                input_audio: {
                  data?: string;
                  format?: string;
                  url?: string;
                };
                type: "input_audio";
              }
            | {
                type: "input_video" | "video_url";
                url?:
                  | string
                  | {
                      url: string;
                    };
                video_url?:
                  | string
                  | {
                      url: string;
                    };
              }[];
        }[];
    model: string;
    provider?: {
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
      google?: {
        task_type?: string;
        title?: string;
      };
      mistral?: {
        output_dtype?: "float" | "int8" | "uint8" | "binary" | "ubinary";
      };
    };
    user?: string;
  };
};

/**
 * Creates an embedding vector representing the input text.
 */
export async function createEmbedding(
  client: Client,
  args: CreateEmbeddingParams = {},
): Promise<{
  data?: {
    embedding?: number[];
    index?: number;
    object?: string;
  }[];
  model?: string;
  object?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    server_tool_use?: {
      datetime_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/embeddings";
  return client.request<{
    data?: {
      embedding?: number[];
      index?: number;
      object?: string;
    }[];
    model?: string;
    object?: string;
    usage?: {
      completion_tokens?: number;
      prompt_tokens?: number;
      server_tool_use?: {
        datetime_requests?: number;
        web_fetch_requests?: number;
        web_search_requests?: number;
      };
      total_tokens?: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateImageParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    model: string;
    n?: number;
    prompt: string;
    provider?: {
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
    quality?: string;
    response_format?: string;
    size?: string;
    style?: string;
    user?: string;
  };
};

/**
 * Creates an image given a prompt.
 */
export async function createImage(
  client: Client,
  args: CreateImageParams = {},
): Promise<{
  created?: number;
  data?: {
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/images/generations";
  return client.request<{
    created?: number;
    data?: {
      b64_json?: string;
      revised_prompt?: string;
      url?: string;
    }[];
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateImageEditParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    image: string;
    mask?: string;
    meta?: boolean;
    model: string;
    n?: number;
    prompt: string;
    provider?: {
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
    size?: string;
    usage?: boolean;
    user?: string;
  };
};

/**
 * Creates an edited or extended image given an original image and a prompt.
 */
export async function createImageEdit(
  client: Client,
  args: CreateImageEditParams = {},
): Promise<{
  created?: number;
  data?: {
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/images/edits";
  return client.request<{
    created?: number;
    data?: {
      b64_json?: string;
      revised_prompt?: string;
      url?: string;
    }[];
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateModerationParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    input:
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
        }[];
    meta?: boolean;
    model: string;
    provider?: {
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
  };
};

/**
 * Classifies if text violates OpenAI's usage policies.
 */
export async function createModeration(
  client: Client,
  args: CreateModerationParams = {},
): Promise<{
  id?: string;
  model?: string;
  results?: {
    categories?: {
      harassment?: boolean;
      "harassment/threatening"?: boolean;
      hate?: boolean;
      "hate/threatening"?: boolean;
      "self-harm"?: boolean;
      "self-harm/instructions"?: boolean;
      "self-harm/intent"?: boolean;
      sexual?: boolean;
      "sexual/minors"?: boolean;
      violence?: boolean;
      "violence/graphic"?: boolean;
    };
    category_scores?: {
      harassment?: number;
      "harassment/threatening"?: number;
      hate?: number;
      "hate/threatening"?: number;
      "self-harm"?: number;
      "self-harm/instructions"?: number;
      "self-harm/intent"?: number;
      sexual?: number;
      "sexual/minors"?: number;
      violence?: number;
      "violence/graphic"?: number;
    };
    flagged?: boolean;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/moderations";
  return client.request<{
    id?: string;
    model?: string;
    results?: {
      categories?: {
        harassment?: boolean;
        "harassment/threatening"?: boolean;
        hate?: boolean;
        "hate/threatening"?: boolean;
        "self-harm"?: boolean;
        "self-harm/instructions"?: boolean;
        "self-harm/intent"?: boolean;
        sexual?: boolean;
        "sexual/minors"?: boolean;
        violence?: boolean;
        "violence/graphic"?: boolean;
      };
      category_scores?: {
        harassment?: number;
        "harassment/threatening"?: number;
        hate?: number;
        "hate/threatening"?: number;
        "self-harm"?: number;
        "self-harm/instructions"?: number;
        "self-harm/intent"?: number;
        sexual?: number;
        "sexual/minors"?: number;
        violence?: number;
        "violence/graphic"?: number;
      };
      flagged?: boolean;
    }[];
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateOcrParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    echo_upstream_request?: boolean;
    image: string;
    language?: string;
    model: string;
    provider?: {
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
  };
};

/**
 * Extracts text from an image using the requested model.
 */
export async function createOcr(
  client: Client,
  args: CreateOcrParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/ocr";
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateRerankParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    documents:
      | string[]
      | {
          [key: string]: unknown;
        }[];
    max_chunks_per_doc?: number;
    metadata?: {
      [key: string]: string;
    };
    model: string;
    provider?: {
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
      [key: string]: unknown;
    };
    query: string;
    rank_fields?: string[];
    return_documents?: boolean;
    top_k?: number;
    top_n?: number;
    user?: string;
  };
};

/**
 * Reranks a list of documents against a query.
 */
export async function createRerank(
  client: Client,
  args: CreateRerankParams = {},
): Promise<{
  id?: string;
  model?: string;
  nativeResponseId?: string | null;
  object?: string;
  results?: {
    document?:
      | string
      | {
          [key: string]: unknown;
        };
    index?: number;
    relevance_score?: number;
  }[];
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    server_tool_use?: {
      datetime_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/rerank";
  return client.request<{
    id?: string;
    model?: string;
    nativeResponseId?: string | null;
    object?: string;
    results?: {
      document?:
        | string
        | {
            [key: string]: unknown;
          };
      index?: number;
      relevance_score?: number;
    }[];
    usage?: {
      completion_tokens?: number;
      prompt_tokens?: number;
      server_tool_use?: {
        datetime_requests?: number;
        web_fetch_requests?: number;
        web_search_requests?: number;
      };
      total_tokens?: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateResponseParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    background?: boolean;
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    echo_upstream_request?: boolean;
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
    include?: string[];
    input:
      | string
      | {
          content?: string | {}[] | {};
          role?: "user" | "assistant" | "system" | "developer";
          type?: string;
        }[]
      | {};
    instructions?: string;
    max_output_tokens?: number;
    meta?: boolean;
    metadata?: {
      [key: string]: string;
    };
    modalities?: "text" | "image" | "audio"[];
    model: string;
    parallel_tool_calls?: boolean;
    previous_response_id?: string;
    prompt_cache_key?: string | null;
    provider?: {
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
    safety_identifier?: string | null;
    service_tier?: "auto" | "default" | "flex" | "standard" | "priority";
    session_id?: string;
    store?: boolean;
    stream?: boolean;
    temperature?: number;
    text?: {};
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
    top_p?: number;
    truncation?: "auto" | "disabled";
    usage?: boolean;
    user?: string;
  };
};

/**
 * Creates a response using the Responses API.
 */
export async function createResponse(
  client: Client,
  args: CreateResponseParams = {},
): Promise<{
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
      datetime_requests?: number;
      web_fetch_requests?: number;
      web_search_requests?: number;
    };
    total_tokens?: number;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/responses";
  return client.request<{
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
        datetime_requests?: number;
        web_fetch_requests?: number;
        web_search_requests?: number;
      };
      total_tokens?: number;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateSpeechParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    format?: "mp3" | "wav" | "ogg" | "aac";
    input: string;
    model: string;
    provider?: {
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
    voice?: string;
  };
};

/**
 * Generates audio from the input text.
 */
export async function createSpeech(
  client: Client,
  args: CreateSpeechParams = {},
): Promise<Blob> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/speech";
  return client.request<Blob>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateTranscriptionParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    audio_b64?: string;
    audio_url?: string;
    language?: string;
    model: string;
    provider?: {
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
  };
};

/**
 * Transcribes audio into the input language.
 */
export async function createTranscription(
  client: Client,
  args: CreateTranscriptionParams = {},
): Promise<{
  text?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/transcriptions";
  return client.request<{
    text?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateTranslationParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    audio_b64?: string;
    audio_url?: string;
    language?: string;
    model: string;
    prompt?: string;
    provider?: {
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
    temperature?: number;
  };
};

/**
 * Translates audio into English.
 */
export async function createTranslation(
  client: Client,
  args: CreateTranslationParams = {},
): Promise<{
  text?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/translations";
  return client.request<{
    text?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateVideoParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    aspect_ratio?: string;
    compression_quality?: number;
    duration?: number;
    enhance_prompt?: boolean;
    generate_audio?: boolean;
    input_references?: {
      image_url?: {
        url: string;
      };
      reference_type?: string;
      role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
      type: "image_url";
    }[];
    model: string;
    negative_prompt?: string;
    output?: {
      access?: "bytes" | "signed_url" | "both";
    };
    person_generation?: string;
    prompt: string;
    provider?: {
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
    provider_params?: {
      [key: string]: unknown;
    };
    resize_mode?: string;
    resolution?: string;
    sample_count?: number;
    seed?: number;
    size?: string;
    webhook?: {
      events?: string[];
      secret?: string;
      url?: string;
    };
  };
};

/**
 * Creates an async video generation job. Poll the returned `polling_url` every 20 seconds until the job reaches a terminal status.
 */
export async function createVideo(
  client: Client,
  args: CreateVideoParams = {},
): Promise<{
  asset?: {
    bytes?: number;
    duration_seconds?: number;
    height?: number;
    id?: string;
    mime_type?: string;
    sha256?: string;
    width?: number;
  } | null;
  audio?: boolean;
  billing?: {
    [key: string]: unknown;
  };
  completed_at?: number | string | null;
  content_url?: string;
  created_at?: number | string;
  download_url?: string | null;
  error?: unknown | null;
  expires_at?: number | null;
  generation_id?: string | null;
  id?: string;
  model?: string;
  object?: string;
  output_access?: "bytes" | "signed_url" | "both";
  outputs?: {
    bytes_available?: boolean;
    content_url?: string;
    download_url?: string;
    expires_at?: number;
    index?: number;
    mime_type?: string;
  }[];
  poll_after_seconds?: number;
  polling_url?: string;
  progress?: number | null;
  progress_source?: string;
  provider?: string;
  request_id?: string;
  seconds?: number;
  session_id?: string;
  size?: string;
  started_at?: number | string | null;
  status?:
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  usage?: {
    cost?: number;
    is_byok?: boolean;
    [key: string]: unknown;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/videos";
  return client.request<{
    asset?: {
      bytes?: number;
      duration_seconds?: number;
      height?: number;
      id?: string;
      mime_type?: string;
      sha256?: string;
      width?: number;
    } | null;
    audio?: boolean;
    billing?: {
      [key: string]: unknown;
    };
    completed_at?: number | string | null;
    content_url?: string;
    created_at?: number | string;
    download_url?: string | null;
    error?: unknown | null;
    expires_at?: number | null;
    generation_id?: string | null;
    id?: string;
    model?: string;
    object?: string;
    output_access?: "bytes" | "signed_url" | "both";
    outputs?: {
      bytes_available?: boolean;
      content_url?: string;
      download_url?: string;
      expires_at?: number;
      index?: number;
      mime_type?: string;
    }[];
    poll_after_seconds?: number;
    polling_url?: string;
    progress?: number | null;
    progress_source?: string;
    provider?: string;
    request_id?: string;
    seconds?: number;
    session_id?: string;
    size?: string;
    started_at?: number | string | null;
    status?:
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled"
      | "expired";
    usage?: {
      cost?: number;
      is_byok?: boolean;
      [key: string]: unknown;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateVideoAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    aspect_ratio?: string;
    compression_quality?: number;
    duration?: number;
    enhance_prompt?: boolean;
    generate_audio?: boolean;
    input_references?: {
      image_url?: {
        url: string;
      };
      reference_type?: string;
      role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
      type: "image_url";
    }[];
    model: string;
    negative_prompt?: string;
    output?: {
      access?: "bytes" | "signed_url" | "both";
    };
    person_generation?: string;
    prompt: string;
    provider?: {
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
    provider_params?: {
      [key: string]: unknown;
    };
    resize_mode?: string;
    resolution?: string;
    sample_count?: number;
    seed?: number;
    size?: string;
    webhook?: {
      events?: string[];
      secret?: string;
      url?: string;
    };
  };
};

/**
 * Alias of /videos.
 */
export async function createVideoAlias(
  client: Client,
  args: CreateVideoAliasParams = {},
): Promise<{
  asset?: {
    bytes?: number;
    duration_seconds?: number;
    height?: number;
    id?: string;
    mime_type?: string;
    sha256?: string;
    width?: number;
  } | null;
  audio?: boolean;
  billing?: {
    [key: string]: unknown;
  };
  completed_at?: number | string | null;
  content_url?: string;
  created_at?: number | string;
  download_url?: string | null;
  error?: unknown | null;
  expires_at?: number | null;
  generation_id?: string | null;
  id?: string;
  model?: string;
  object?: string;
  output_access?: "bytes" | "signed_url" | "both";
  outputs?: {
    bytes_available?: boolean;
    content_url?: string;
    download_url?: string;
    expires_at?: number;
    index?: number;
    mime_type?: string;
  }[];
  poll_after_seconds?: number;
  polling_url?: string;
  progress?: number | null;
  progress_source?: string;
  provider?: string;
  request_id?: string;
  seconds?: number;
  session_id?: string;
  size?: string;
  started_at?: number | string | null;
  status?:
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  usage?: {
    cost?: number;
    is_byok?: boolean;
    [key: string]: unknown;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/video/generations";
  return client.request<{
    asset?: {
      bytes?: number;
      duration_seconds?: number;
      height?: number;
      id?: string;
      mime_type?: string;
      sha256?: string;
      width?: number;
    } | null;
    audio?: boolean;
    billing?: {
      [key: string]: unknown;
    };
    completed_at?: number | string | null;
    content_url?: string;
    created_at?: number | string;
    download_url?: string | null;
    error?: unknown | null;
    expires_at?: number | null;
    generation_id?: string | null;
    id?: string;
    model?: string;
    object?: string;
    output_access?: "bytes" | "signed_url" | "both";
    outputs?: {
      bytes_available?: boolean;
      content_url?: string;
      download_url?: string;
      expires_at?: number;
      index?: number;
      mime_type?: string;
    }[];
    poll_after_seconds?: number;
    polling_url?: string;
    progress?: number | null;
    progress_source?: string;
    provider?: string;
    request_id?: string;
    seconds?: number;
    session_id?: string;
    size?: string;
    started_at?: number | string | null;
    status?:
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled"
      | "expired";
    usage?: {
      cost?: number;
      is_byok?: boolean;
      [key: string]: unknown;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateVideoDownloadUrlParams = {
  path?: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    disposition?: "attachment" | "inline";
    index?: number;
    ttl_seconds?: number;
  };
};

/**
 * Returns a signed first-party download URL for a rendered video.
 */
export async function createVideoDownloadUrl(
  client: Client,
  args: CreateVideoDownloadUrlParams = {},
): Promise<{
  download_url?: string;
  expires_at?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/videos/${encodeURIComponent(String(path?.video_id))}/download_url`;
  return client.request<{
    download_url?: string;
    expires_at?: number;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateVideoDownloadUrlAliasParams = {
  path?: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    disposition?: "attachment" | "inline";
    index?: number;
    ttl_seconds?: number;
  };
};

/**
 * Alias of /videos/{video_id}/download_url.
 */
export async function createVideoDownloadUrlAlias(
  client: Client,
  args: CreateVideoDownloadUrlAliasParams = {},
): Promise<{
  download_url?: string;
  expires_at?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path?.video_id))}/download_url`;
  return client.request<{
    download_url?: string;
    expires_at?: number;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateWorkspaceParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    name: string;
    slug?: string;
  };
};

/**
 * Creates a new workspace for the authenticated owner. Management API key required.
 */
export async function createWorkspace(
  client: Client,
  args: CreateWorkspaceParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    id: string;
    name: string | null;
    slug: string | null;
    updated_at: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/workspaces";
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      id: string;
      name: string | null;
      slug: string | null;
      updated_at: string | null;
    };
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteApiKeyParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes an API key in the authenticated workspace. Management API key required.
 */
export async function deleteApiKey(
  client: Client,
  args: DeleteApiKeyParams = {},
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/keys/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteVideoParams = {
  path?: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Tombstones a terminal video generation record. In-progress jobs cannot be deleted.
 */
export async function deleteVideo(
  client: Client,
  args: DeleteVideoParams = {},
): Promise<{
  deleted?: boolean;
  id?: string;
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/videos/${encodeURIComponent(String(path?.video_id))}`;
  return client.request<{
    deleted?: boolean;
    id?: string;
    object?: string;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteVideoAliasParams = {
  path?: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos/{video_id}.
 */
export async function deleteVideoAlias(
  client: Client,
  args: DeleteVideoAliasParams = {},
): Promise<{
  deleted?: boolean;
  id?: string;
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path?.video_id))}`;
  return client.request<{
    deleted?: boolean;
    id?: string;
    object?: string;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteWorkspaceParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes a workspace by UUID or slug. Management API key required.
 */
export async function deleteWorkspace(
  client: Client,
  args: DeleteWorkspaceParams = {},
): Promise<{
  deleted: true;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    deleted: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GenerateMusicParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    duration?: number;
    echo_upstream_request?: boolean;
    elevenlabs?: {
      composition_plan?: {};
      force_instrumental?: boolean;
      model_id?: string;
      music_length_ms?: number;
      output_format?: string;
      prompt?: string;
      sign_with_c2pa?: boolean;
      store_for_inpainting?: boolean;
      with_timestamps?: boolean;
    };
    format?: "mp3" | "wav" | "ogg" | "aac";
    model: string;
    prompt?: string;
    provider?: {
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
    suno?: {
      audioWeight?: number;
      callBackUrl?: string;
      customMode?: boolean;
      instrumental?: boolean;
      model?: string;
      negativeTags?: string;
      personaId?: string;
      prompt?: string;
      style?: string;
      styleWeight?: number;
      title?: string;
      vocalGender?: "m" | "f";
      weirdnessConstraint?: number;
    };
  };
};

/**
 * Generates music using the requested model and provider settings.
 */
export async function generateMusic(
  client: Client,
  args: GenerateMusicParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/music/generate";
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GenerateMusicAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    duration?: number;
    echo_upstream_request?: boolean;
    elevenlabs?: {
      composition_plan?: {};
      force_instrumental?: boolean;
      model_id?: string;
      music_length_ms?: number;
      output_format?: string;
      prompt?: string;
      sign_with_c2pa?: boolean;
      store_for_inpainting?: boolean;
      with_timestamps?: boolean;
    };
    format?: "mp3" | "wav" | "ogg" | "aac";
    model: string;
    prompt?: string;
    provider?: {
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
    suno?: {
      audioWeight?: number;
      callBackUrl?: string;
      customMode?: boolean;
      instrumental?: boolean;
      model?: string;
      negativeTags?: string;
      personaId?: string;
      prompt?: string;
      style?: string;
      styleWeight?: number;
      title?: string;
      vocalGender?: "m" | "f";
      weirdnessConstraint?: number;
    };
  };
};

/**
 * Alias of /music/generate.
 */
export async function generateMusicAlias(
  client: Client,
  args: GenerateMusicAliasParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/music/generations";
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetActivityParams = {
  path?: Record<string, never>;
  query?: {
    days?: number;
    limit?: number;
    offset?: number;
    workspace_id?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns recent request activity for the authenticated workspace. Management API key required.
 */
export async function getActivity(
  client: Client,
  args: GetActivityParams = {},
): Promise<{
  activity: {
    cost_cents: number;
    endpoint: string | null;
    latency_ms: number | null;
    model: string | null;
    provider: string | null;
    request_id: string | null;
    timestamp: string | null;
    usage: {
      [key: string]: unknown;
    } | null;
  }[];
  limit: number;
  offset: number;
  ok: true;
  period_days: number;
  total: number;
  total_cost_cents: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/activity";
  return client.request<{
    activity: {
      cost_cents: number;
      endpoint: string | null;
      latency_ms: number | null;
      model: string | null;
      provider: string | null;
      request_id: string | null;
      timestamp: string | null;
      usage: {
        [key: string]: unknown;
      } | null;
    }[];
    limit: number;
    offset: number;
    ok: true;
    period_days: number;
    total: number;
    total_cost_cents: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetActivityAliasParams = {
  path?: Record<string, never>;
  query?: {
    date?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /activity. Returns user activity grouped by endpoint for the last 30 completed UTC days.
 */
export async function getActivityAlias(
  client: Client,
  args: GetActivityAliasParams = {},
): Promise<{
  data: {
    byok_usage_inference: number;
    completion_tokens: number;
    date: string;
    endpoint_id: string;
    model: string;
    model_permaslug: string;
    prompt_tokens: number;
    provider_name: string;
    reasoning_tokens: number;
    requests: number;
    usage: number;
  }[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/analytics";
  return client.request<{
    data: {
      byok_usage_inference: number;
      completion_tokens: number;
      date: string;
      endpoint_id: string;
      model: string;
      model_permaslug: string;
      prompt_tokens: number;
      provider_name: string;
      reasoning_tokens: number;
      requests: number;
      usage: number;
    }[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetApiKeyParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns metadata for one API key in the authenticated workspace. Management API key required.
 */
export async function getApiKey(
  client: Client,
  args: GetApiKeyParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    label: string | null;
    last_used_at: string | null;
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    updated_at: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/keys/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      label: string | null;
      last_used_at: string | null;
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      updated_at: string | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetCreditsParams = {
  path?: Record<string, never>;
  query?: {
    workspace_id?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns remaining credits and usage statistics for the authenticated workspace. Management API key required.
 */
export async function getCredits(
  client: Client,
  args: GetCreditsParams = {},
): Promise<{
  credits: {
    available_nanos: number;
    balance_nanos: number;
    remaining: number;
    reserved_nanos: number;
    thirty_day_requests: number;
    thirty_day_usage: number | null;
  };
  ok: true;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/credits";
  return client.request<{
    credits: {
      available_nanos: number;
      balance_nanos: number;
      remaining: number;
      reserved_nanos: number;
      thirty_day_requests: number;
      thirty_day_usage: number | null;
    };
    ok: true;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetCurrentApiKeyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns metadata for the currently authenticated standard Gateway API key.
 */
export async function getCurrentApiKey(
  client: Client,
  args: GetCurrentApiKeyParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    label: string | null;
    last_used_at: string | null;
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    updated_at: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/key";
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      label: string | null;
      last_used_at: string | null;
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      updated_at: string | null;
      workspace_id: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetGenerationParams = {
  path?: Record<string, never>;
  query?: {
    id: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieve a specific generation by ID.
 */
export async function getGeneration(
  client: Client,
  args: GetGenerationParams = {},
): Promise<{
  app_id?: string | null;
  byok?: boolean;
  cost_nanos?: number;
  created_at?: string;
  currency?: string;
  endpoint?: string;
  error_code?: string | null;
  error_message?: string | null;
  generation_ms?: number;
  key_id?: string;
  latency_ms?: number;
  model_id?: string;
  native_response_id?: string | null;
  pricing_lines?: {}[];
  provider?: string;
  replay_request?: {
    [key: string]: unknown;
  } | null;
  replay_supported?: boolean;
  request_id?: string;
  status_code?: number;
  stream?: boolean;
  success?: boolean;
  team_id?: string;
  throughput?: number | null;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  } | null;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/generations";
  return client.request<{
    app_id?: string | null;
    byok?: boolean;
    cost_nanos?: number;
    created_at?: string;
    currency?: string;
    endpoint?: string;
    error_code?: string | null;
    error_message?: string | null;
    generation_ms?: number;
    key_id?: string;
    latency_ms?: number;
    model_id?: string;
    native_response_id?: string | null;
    pricing_lines?: {}[];
    provider?: string;
    replay_request?: {
      [key: string]: unknown;
    } | null;
    replay_supported?: boolean;
    request_id?: string;
    status_code?: number;
    stream?: boolean;
    success?: boolean;
    team_id?: string;
    throughput?: number | null;
    usage?: {
      completion_tokens?: number;
      prompt_tokens?: number;
      total_tokens?: number;
    } | null;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetHealthParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a minimal gateway health snapshot.
 */
export async function getHealth(
  client: Client,
  args: GetHealthParams = {},
): Promise<{
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/health";
  return client.request<{
    status?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetMusicGenerationParams = {
  path?: {
    music_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves the status for a music generation request.
 */
export async function getMusicGeneration(
  client: Client,
  args: GetMusicGenerationParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/music/generate/${encodeURIComponent(String(path?.music_id))}`;
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetMusicGenerationAliasParams = {
  path?: {
    music_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /music/generate/{music_id}.
 */
export async function getMusicGenerationAlias(
  client: Client,
  args: GetMusicGenerationAliasParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/music/generations/${encodeURIComponent(String(path?.music_id))}`;
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetProviderDerankStatusParams = {
  path?: {
    provider_id: string;
  };
  query?: {
    fetch_limit?: number;
    max_pairs?: number;
    window_hours?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns breaker-based derank/recovery status for a provider.
 */
export async function getProviderDerankStatus(
  client: Client,
  args: GetProviderDerankStatusParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/health/providers/${encodeURIComponent(String(path?.provider_id))}/derank`;
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetVideoParams = {
  path?: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves the status for a video generation request. Poll every 20 seconds unless you are using webhooks.
 */
export async function getVideo(
  client: Client,
  args: GetVideoParams = {},
): Promise<{
  asset?: {
    bytes?: number;
    duration_seconds?: number;
    height?: number;
    id?: string;
    mime_type?: string;
    sha256?: string;
    width?: number;
  } | null;
  audio?: boolean;
  billing?: {
    [key: string]: unknown;
  };
  completed_at?: number | string | null;
  content_url?: string;
  created_at?: number | string;
  download_url?: string | null;
  error?: unknown | null;
  expires_at?: number | null;
  generation_id?: string | null;
  id?: string;
  model?: string;
  object?: string;
  output_access?: "bytes" | "signed_url" | "both";
  outputs?: {
    bytes_available?: boolean;
    content_url?: string;
    download_url?: string;
    expires_at?: number;
    index?: number;
    mime_type?: string;
  }[];
  poll_after_seconds?: number;
  polling_url?: string;
  progress?: number | null;
  progress_source?: string;
  provider?: string;
  request_id?: string;
  seconds?: number;
  session_id?: string;
  size?: string;
  started_at?: number | string | null;
  status?:
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  usage?: {
    cost?: number;
    is_byok?: boolean;
    [key: string]: unknown;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/videos/${encodeURIComponent(String(path?.video_id))}`;
  return client.request<{
    asset?: {
      bytes?: number;
      duration_seconds?: number;
      height?: number;
      id?: string;
      mime_type?: string;
      sha256?: string;
      width?: number;
    } | null;
    audio?: boolean;
    billing?: {
      [key: string]: unknown;
    };
    completed_at?: number | string | null;
    content_url?: string;
    created_at?: number | string;
    download_url?: string | null;
    error?: unknown | null;
    expires_at?: number | null;
    generation_id?: string | null;
    id?: string;
    model?: string;
    object?: string;
    output_access?: "bytes" | "signed_url" | "both";
    outputs?: {
      bytes_available?: boolean;
      content_url?: string;
      download_url?: string;
      expires_at?: number;
      index?: number;
      mime_type?: string;
    }[];
    poll_after_seconds?: number;
    polling_url?: string;
    progress?: number | null;
    progress_source?: string;
    provider?: string;
    request_id?: string;
    seconds?: number;
    session_id?: string;
    size?: string;
    started_at?: number | string | null;
    status?:
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled"
      | "expired";
    usage?: {
      cost?: number;
      is_byok?: boolean;
      [key: string]: unknown;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetVideoAliasParams = {
  path?: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos/{video_id}.
 */
export async function getVideoAlias(
  client: Client,
  args: GetVideoAliasParams = {},
): Promise<{
  asset?: {
    bytes?: number;
    duration_seconds?: number;
    height?: number;
    id?: string;
    mime_type?: string;
    sha256?: string;
    width?: number;
  } | null;
  audio?: boolean;
  billing?: {
    [key: string]: unknown;
  };
  completed_at?: number | string | null;
  content_url?: string;
  created_at?: number | string;
  download_url?: string | null;
  error?: unknown | null;
  expires_at?: number | null;
  generation_id?: string | null;
  id?: string;
  model?: string;
  object?: string;
  output_access?: "bytes" | "signed_url" | "both";
  outputs?: {
    bytes_available?: boolean;
    content_url?: string;
    download_url?: string;
    expires_at?: number;
    index?: number;
    mime_type?: string;
  }[];
  poll_after_seconds?: number;
  polling_url?: string;
  progress?: number | null;
  progress_source?: string;
  provider?: string;
  request_id?: string;
  seconds?: number;
  session_id?: string;
  size?: string;
  started_at?: number | string | null;
  status?:
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  usage?: {
    cost?: number;
    is_byok?: boolean;
    [key: string]: unknown;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path?.video_id))}`;
  return client.request<{
    asset?: {
      bytes?: number;
      duration_seconds?: number;
      height?: number;
      id?: string;
      mime_type?: string;
      sha256?: string;
      width?: number;
    } | null;
    audio?: boolean;
    billing?: {
      [key: string]: unknown;
    };
    completed_at?: number | string | null;
    content_url?: string;
    created_at?: number | string;
    download_url?: string | null;
    error?: unknown | null;
    expires_at?: number | null;
    generation_id?: string | null;
    id?: string;
    model?: string;
    object?: string;
    output_access?: "bytes" | "signed_url" | "both";
    outputs?: {
      bytes_available?: boolean;
      content_url?: string;
      download_url?: string;
      expires_at?: number;
      index?: number;
      mime_type?: string;
    }[];
    poll_after_seconds?: number;
    polling_url?: string;
    progress?: number | null;
    progress_source?: string;
    provider?: string;
    request_id?: string;
    seconds?: number;
    session_id?: string;
    size?: string;
    started_at?: number | string | null;
    status?:
      | "queued"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled"
      | "expired";
    usage?: {
      cost?: number;
      is_byok?: boolean;
      [key: string]: unknown;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetVideoContentParams = {
  path?: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Downloads the rendered video content.
 */
export async function getVideoContent(
  client: Client,
  args: GetVideoContentParams = {},
): Promise<Blob> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/videos/${encodeURIComponent(String(path?.video_id))}/content`;
  return client.request<Blob>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetVideoContentAliasParams = {
  path?: {
    video_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos/{video_id}/content.
 */
export async function getVideoContentAlias(
  client: Client,
  args: GetVideoContentAliasParams = {},
): Promise<Blob> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path?.video_id))}/content`;
  return client.request<Blob>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetWorkspaceParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a workspace by UUID or slug. Management API key required.
 */
export async function getWorkspace(
  client: Client,
  args: GetWorkspaceParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    id: string;
    name: string | null;
    slug: string | null;
    updated_at: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      id: string;
      name: string | null;
      slug: string | null;
      updated_at: string | null;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListApiKeysParams = {
  path?: Record<string, never>;
  query?: {
    include_disabled?: boolean;
    limit?: number;
    offset?: number;
    workspace_id?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists API keys for the authenticated workspace. Management API key required.
 */
export async function listApiKeys(
  client: Client,
  args: ListApiKeysParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    label: string | null;
    last_used_at: string | null;
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    updated_at: string | null;
    workspace_id: string;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/keys";
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      label: string | null;
      last_used_at: string | null;
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      updated_at: string | null;
      workspace_id: string;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListDataModelsParams = {
  path?: Record<string, never>;
  query?: {
    feed?: "json" | "rss" | "atom";
    format?: "json" | "rss" | "atom";
    id?: string | string[];
    include_hidden?: boolean;
    limit?: number;
    model_id?: string | string[];
    offset?: number;
    organisation?:
      | "ai21"
      | "aion-labs"
      | "allenai"
      | "amazon"
      | "anthropic"
      | "arcee-ai"
      | "baidu"
      | "black-forest-labs"
      | "bytedance"
      | "cohere"
      | "cursor"
      | "deepseek"
      | "eleven-labs"
      | "essential-ai"
      | "github"
      | "google"
      | "ibm"
      | "inception"
      | "inclusionai"
      | "kwaipilot"
      | "lg"
      | "liquid-ai"
      | "meituan"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshotai"
      | "naver-hyperclova"
      | "nous"
      | "nvidia"
      | "openai"
      | "perplexity"
      | "poe"
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
      | "windsurf"
      | "x-ai"
      | "xiaomi"
      | "z-ai"
      | "ai21"
      | "aion-labs"
      | "allenai"
      | "amazon"
      | "anthropic"
      | "arcee-ai"
      | "baidu"
      | "black-forest-labs"
      | "bytedance"
      | "cohere"
      | "cursor"
      | "deepseek"
      | "eleven-labs"
      | "essential-ai"
      | "github"
      | "google"
      | "ibm"
      | "inception"
      | "inclusionai"
      | "kwaipilot"
      | "lg"
      | "liquid-ai"
      | "meituan"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshotai"
      | "naver-hyperclova"
      | "nous"
      | "nvidia"
      | "openai"
      | "perplexity"
      | "poe"
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
      | "windsurf"
      | "x-ai"
      | "xiaomi"
      | "z-ai"[];
    status?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns source catalogue models from the data_models table.
 */
export async function listDataModels(
  client: Client,
  args: ListDataModelsParams = {},
): Promise<{
  include_hidden?: boolean;
  limit?: number;
  models?: {
    deprecation_date?: string | null;
    hidden?: boolean;
    input_types?: string[];
    lifecycle?: {
      deprecation_date?: string | null;
      message?: string | null;
      replacement_model_id?: string | null;
      retirement_date?: string | null;
      status?: "active" | "deprecated" | "retired" | null;
    };
    model_id?: string | null;
    name?: string | null;
    organisation?: {
      colour?: string | null;
      country_code?: string | null;
      name?: string | null;
      organisation_id?: string | null;
    } | null;
    output_types?: string[];
    release_date?: string | null;
    retirement_date?: string | null;
    status?: string | null;
  }[];
  offset?: number;
  ok?: boolean;
  total?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/data/models";
  return client.request<{
    include_hidden?: boolean;
    limit?: number;
    models?: {
      deprecation_date?: string | null;
      hidden?: boolean;
      input_types?: string[];
      lifecycle?: {
        deprecation_date?: string | null;
        message?: string | null;
        replacement_model_id?: string | null;
        retirement_date?: string | null;
        status?: "active" | "deprecated" | "retired" | null;
      };
      model_id?: string | null;
      name?: string | null;
      organisation?: {
        colour?: string | null;
        country_code?: string | null;
        name?: string | null;
        organisation_id?: string | null;
      } | null;
      output_types?: string[];
      release_date?: string | null;
      retirement_date?: string | null;
      status?: string | null;
    }[];
    offset?: number;
    ok?: boolean;
    total?: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListEndpointsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists currently exposed gateway endpoint IDs and sample models.
 */
export async function listEndpoints(
  client: Client,
  args: ListEndpointsParams = {},
): Promise<{
  endpoints?: string[];
  ok?: boolean;
  sample_models?: string[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/endpoints";
  return client.request<{
    endpoints?: string[];
    ok?: boolean;
    sample_models?: string[];
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListFilesParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Currently returns `not_supported` on the shared gateway key. Persist uploaded file ids and retrieve them directly instead.
 */
export async function listFiles(
  client: Client,
  args: ListFilesParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/files";
  return client.request<unknown>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListModelsParams = {
  path?: Record<string, never>;
  query?: {
    availability?: "active" | "all";
    capability_status?: string[];
    endpoints?: string[];
    feed?: "json" | "rss" | "atom";
    format?: "json" | "rss" | "atom";
    input_types?: string[];
    limit?: number;
    model_routing_status?: string[];
    offset?: number;
    organisation?:
      | "ai21"
      | "aion-labs"
      | "allenai"
      | "amazon"
      | "anthropic"
      | "arcee-ai"
      | "baidu"
      | "black-forest-labs"
      | "bytedance"
      | "cohere"
      | "cursor"
      | "deepseek"
      | "eleven-labs"
      | "essential-ai"
      | "github"
      | "google"
      | "ibm"
      | "inception"
      | "inclusionai"
      | "kwaipilot"
      | "lg"
      | "liquid-ai"
      | "meituan"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshotai"
      | "naver-hyperclova"
      | "nous"
      | "nvidia"
      | "openai"
      | "perplexity"
      | "poe"
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
      | "windsurf"
      | "x-ai"
      | "xiaomi"
      | "z-ai"
      | "ai21"
      | "aion-labs"
      | "allenai"
      | "amazon"
      | "anthropic"
      | "arcee-ai"
      | "baidu"
      | "black-forest-labs"
      | "bytedance"
      | "cohere"
      | "cursor"
      | "deepseek"
      | "eleven-labs"
      | "essential-ai"
      | "github"
      | "google"
      | "ibm"
      | "inception"
      | "inclusionai"
      | "kwaipilot"
      | "lg"
      | "liquid-ai"
      | "meituan"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshotai"
      | "naver-hyperclova"
      | "nous"
      | "nvidia"
      | "openai"
      | "perplexity"
      | "poe"
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
      | "windsurf"
      | "x-ai"
      | "xiaomi"
      | "z-ai"[];
    output_types?: string[];
    params?: string[];
    provider?: string[];
    provider_availability_reason?: string[];
    provider_availability_status?: string[];
    provider_routing_status?: string[];
    provider_status?: string[];
    status?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns shared non-hidden gateway models. Defaults to currently publicly routable models; use availability=all to include non-routable availability records.
 */
export async function listModels(
  client: Client,
  args: ListModelsParams = {},
): Promise<{
  availability_mode: "active" | "all";
  limit: number;
  models: {
    aliases?: string[];
    architecture?: {
      input_modalities?: string[];
      instruct_type?: string | null;
      modality?: string;
      output_modalities?: string[];
      tokenizer?: string | null;
    };
    availability?: {
      active_provider_count: number;
      inactive_provider_count: number;
      provider_count: number;
      status: "active" | "coming_soon" | "inactive" | "not_listed";
    };
    canonical_slug?: string;
    created?: number | null;
    deprecation_date?: string | null;
    description?: string;
    endpoints?: string[];
    id?: string;
    input_types?: string[];
    lifecycle?: {
      deprecation_date?: string | null;
      message?: string | null;
      replacement_model_id?: string | null;
      retirement_date?: string | null;
      status?: "active" | "deprecated" | "retired" | null;
    };
    model_id?: string;
    name?: string | null;
    organisation_colour?: string | null;
    organisation_id?: string | null;
    organisation_name?: string | null;
    output_types?: string[];
    per_request_limits?: {
      [key: string]: unknown;
    } | null;
    pricing?: {
      completion?: string | null;
      image?: string | null;
      input_cache_read?: string | null;
      input_cache_write?: string | null;
      prompt?: string | null;
      request?: string | null;
      web_search?: string | null;
    };
    pricing_detail?: {
      meters?: {
        [key: string]: unknown;
      };
      pricing_plan?: string;
    };
    providers?: {
      api_provider_id: string;
      api_provider_name?: string | null;
      availability_reason:
        | "active"
        | "preview_only"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "internal_testing"
        | "scheduled"
        | "coming_soon"
        | "provider_disabled"
        | "model_disabled"
        | "capability_disabled"
        | "provider_not_ready"
        | "provider_inactive"
        | "inactive"
        | "retired";
      availability_status: "active" | "coming_soon" | "inactive";
      capability_status:
        | "active"
        | "coming_soon"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled"
        | "internal_testing";
      effective_from?: string | null;
      effective_to?: string | null;
      endpoints: string[];
      is_active_gateway: boolean;
      model_routing_status:
        | "active"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled";
      params: string[];
      provider_routing_status:
        | "active"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled";
      provider_status:
        | "active"
        | "beta"
        | "alpha"
        | "not_ready"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked";
    }[];
    release_date?: string | null;
    retirement_date?: string | null;
    status?: string | null;
    supported_parameters?: string[];
    supported_params?: string[];
    top_provider?: {
      context_length?: number | null;
      is_moderated?: boolean;
      max_completion_tokens?: number | null;
    };
    top_provider_id?: string | null;
  }[];
  offset: number;
  ok: boolean;
  privacy_scope: "shared" | "team";
  total: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/gateway/models";
  return client.request<{
    availability_mode: "active" | "all";
    limit: number;
    models: {
      aliases?: string[];
      architecture?: {
        input_modalities?: string[];
        instruct_type?: string | null;
        modality?: string;
        output_modalities?: string[];
        tokenizer?: string | null;
      };
      availability?: {
        active_provider_count: number;
        inactive_provider_count: number;
        provider_count: number;
        status: "active" | "coming_soon" | "inactive" | "not_listed";
      };
      canonical_slug?: string;
      created?: number | null;
      deprecation_date?: string | null;
      description?: string;
      endpoints?: string[];
      id?: string;
      input_types?: string[];
      lifecycle?: {
        deprecation_date?: string | null;
        message?: string | null;
        replacement_model_id?: string | null;
        retirement_date?: string | null;
        status?: "active" | "deprecated" | "retired" | null;
      };
      model_id?: string;
      name?: string | null;
      organisation_colour?: string | null;
      organisation_id?: string | null;
      organisation_name?: string | null;
      output_types?: string[];
      per_request_limits?: {
        [key: string]: unknown;
      } | null;
      pricing?: {
        completion?: string | null;
        image?: string | null;
        input_cache_read?: string | null;
        input_cache_write?: string | null;
        prompt?: string | null;
        request?: string | null;
        web_search?: string | null;
      };
      pricing_detail?: {
        meters?: {
          [key: string]: unknown;
        };
        pricing_plan?: string;
      };
      providers?: {
        api_provider_id: string;
        api_provider_name?: string | null;
        availability_reason:
          | "active"
          | "preview_only"
          | "gated"
          | "access_limited"
          | "region_limited"
          | "project_limited"
          | "paused"
          | "soft_blocked"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "internal_testing"
          | "scheduled"
          | "coming_soon"
          | "provider_disabled"
          | "model_disabled"
          | "capability_disabled"
          | "provider_not_ready"
          | "provider_inactive"
          | "inactive"
          | "retired";
        availability_status: "active" | "coming_soon" | "inactive";
        capability_status:
          | "active"
          | "coming_soon"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled"
          | "internal_testing";
        effective_from?: string | null;
        effective_to?: string | null;
        endpoints: string[];
        is_active_gateway: boolean;
        model_routing_status:
          | "active"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled";
        params: string[];
        provider_routing_status:
          | "active"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled";
        provider_status:
          | "active"
          | "beta"
          | "alpha"
          | "not_ready"
          | "gated"
          | "access_limited"
          | "region_limited"
          | "project_limited"
          | "paused"
          | "soft_blocked";
      }[];
      release_date?: string | null;
      retirement_date?: string | null;
      status?: string | null;
      supported_parameters?: string[];
      supported_params?: string[];
      top_provider?: {
        context_length?: number | null;
        is_moderated?: boolean;
        max_completion_tokens?: number | null;
      };
      top_provider_id?: string | null;
    }[];
    offset: number;
    ok: boolean;
    privacy_scope: "shared" | "team";
    total: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListOrganisationsParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a list of available organisations.
 */
export async function listOrganisations(
  client: Client,
  args: ListOrganisationsParams = {},
): Promise<{
  limit?: number;
  offset?: number;
  ok?: boolean;
  organisations?: {
    colour?: string | null;
    country_code?: string | null;
    description?: string | null;
    name?: string | null;
    organisation_id?: string;
  }[];
  total?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/organisations";
  return client.request<{
    limit?: number;
    offset?: number;
    ok?: boolean;
    organisations?: {
      colour?: string | null;
      country_code?: string | null;
      description?: string | null;
      name?: string | null;
      organisation_id?: string;
    }[];
    total?: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListPricingModelsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns active provider/model pricing entries.
 */
export async function listPricingModels(
  client: Client,
  args: ListPricingModelsParams = {},
): Promise<{
  models?: {
    [key: string]: unknown;
  }[];
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/pricing/models";
  return client.request<{
    models?: {
      [key: string]: unknown;
    }[];
    ok?: boolean;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListProvidersParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a list of available API providers.
 */
export async function listProviders(
  client: Client,
  args: ListProvidersParams = {},
): Promise<{
  limit?: number;
  offset?: number;
  ok?: boolean;
  providers?: {
    api_provider_id?: string;
    api_provider_name?: string | null;
    country_code?: string | null;
    description?: string | null;
    link?: string | null;
  }[];
  total?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/providers";
  return client.request<{
    limit?: number;
    offset?: number;
    ok?: boolean;
    providers?: {
      api_provider_id?: string;
      api_provider_name?: string | null;
      country_code?: string | null;
      description?: string | null;
      link?: string | null;
    }[];
    total?: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListTeamModelsParams = {
  path?: Record<string, never>;
  query?: {
    availability?: "active" | "all";
    capability_status?: string[];
    endpoints?: string[];
    feed?: "json" | "rss" | "atom";
    format?: "json" | "rss" | "atom";
    input_types?: string[];
    limit?: number;
    model_routing_status?: string[];
    offset?: number;
    organisation?:
      | "ai21"
      | "aion-labs"
      | "allenai"
      | "amazon"
      | "anthropic"
      | "arcee-ai"
      | "baidu"
      | "black-forest-labs"
      | "bytedance"
      | "cohere"
      | "cursor"
      | "deepseek"
      | "eleven-labs"
      | "essential-ai"
      | "github"
      | "google"
      | "ibm"
      | "inception"
      | "inclusionai"
      | "kwaipilot"
      | "lg"
      | "liquid-ai"
      | "meituan"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshotai"
      | "naver-hyperclova"
      | "nous"
      | "nvidia"
      | "openai"
      | "perplexity"
      | "poe"
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
      | "windsurf"
      | "x-ai"
      | "xiaomi"
      | "z-ai"
      | "ai21"
      | "aion-labs"
      | "allenai"
      | "amazon"
      | "anthropic"
      | "arcee-ai"
      | "baidu"
      | "black-forest-labs"
      | "bytedance"
      | "cohere"
      | "cursor"
      | "deepseek"
      | "eleven-labs"
      | "essential-ai"
      | "github"
      | "google"
      | "ibm"
      | "inception"
      | "inclusionai"
      | "kwaipilot"
      | "lg"
      | "liquid-ai"
      | "meituan"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshotai"
      | "naver-hyperclova"
      | "nous"
      | "nvidia"
      | "openai"
      | "perplexity"
      | "poe"
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
      | "windsurf"
      | "x-ai"
      | "xiaomi"
      | "z-ai"[];
    output_types?: string[];
    params?: string[];
    provider?: string[];
    provider_availability_reason?: string[];
    provider_availability_status?: string[];
    provider_routing_status?: string[];
    provider_status?: string[];
    status?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns team-scoped gateway model listings. Defaults to currently publicly routable models; use availability=all to include non-routable availability records.
 */
export async function listTeamModels(
  client: Client,
  args: ListTeamModelsParams = {},
): Promise<{
  availability_mode: "active" | "all";
  limit: number;
  models: {
    aliases?: string[];
    architecture?: {
      input_modalities?: string[];
      instruct_type?: string | null;
      modality?: string;
      output_modalities?: string[];
      tokenizer?: string | null;
    };
    availability?: {
      active_provider_count: number;
      inactive_provider_count: number;
      provider_count: number;
      status: "active" | "coming_soon" | "inactive" | "not_listed";
    };
    canonical_slug?: string;
    created?: number | null;
    deprecation_date?: string | null;
    description?: string;
    endpoints?: string[];
    id?: string;
    input_types?: string[];
    lifecycle?: {
      deprecation_date?: string | null;
      message?: string | null;
      replacement_model_id?: string | null;
      retirement_date?: string | null;
      status?: "active" | "deprecated" | "retired" | null;
    };
    model_id?: string;
    name?: string | null;
    organisation_colour?: string | null;
    organisation_id?: string | null;
    organisation_name?: string | null;
    output_types?: string[];
    per_request_limits?: {
      [key: string]: unknown;
    } | null;
    pricing?: {
      completion?: string | null;
      image?: string | null;
      input_cache_read?: string | null;
      input_cache_write?: string | null;
      prompt?: string | null;
      request?: string | null;
      web_search?: string | null;
    };
    pricing_detail?: {
      meters?: {
        [key: string]: unknown;
      };
      pricing_plan?: string;
    };
    providers?: {
      api_provider_id: string;
      api_provider_name?: string | null;
      availability_reason:
        | "active"
        | "preview_only"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "internal_testing"
        | "scheduled"
        | "coming_soon"
        | "provider_disabled"
        | "model_disabled"
        | "capability_disabled"
        | "provider_not_ready"
        | "provider_inactive"
        | "inactive"
        | "retired";
      availability_status: "active" | "coming_soon" | "inactive";
      capability_status:
        | "active"
        | "coming_soon"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled"
        | "internal_testing";
      effective_from?: string | null;
      effective_to?: string | null;
      endpoints: string[];
      is_active_gateway: boolean;
      model_routing_status:
        | "active"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled";
      params: string[];
      provider_routing_status:
        | "active"
        | "deranked_lvl1"
        | "deranked_lvl2"
        | "deranked_lvl3"
        | "disabled";
      provider_status:
        | "active"
        | "beta"
        | "alpha"
        | "not_ready"
        | "gated"
        | "access_limited"
        | "region_limited"
        | "project_limited"
        | "paused"
        | "soft_blocked";
    }[];
    release_date?: string | null;
    retirement_date?: string | null;
    status?: string | null;
    supported_parameters?: string[];
    supported_params?: string[];
    top_provider?: {
      context_length?: number | null;
      is_moderated?: boolean;
      max_completion_tokens?: number | null;
    };
    top_provider_id?: string | null;
  }[];
  offset: number;
  ok: boolean;
  privacy_scope: "shared" | "team";
  total: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/gateway/models/me";
  return client.request<{
    availability_mode: "active" | "all";
    limit: number;
    models: {
      aliases?: string[];
      architecture?: {
        input_modalities?: string[];
        instruct_type?: string | null;
        modality?: string;
        output_modalities?: string[];
        tokenizer?: string | null;
      };
      availability?: {
        active_provider_count: number;
        inactive_provider_count: number;
        provider_count: number;
        status: "active" | "coming_soon" | "inactive" | "not_listed";
      };
      canonical_slug?: string;
      created?: number | null;
      deprecation_date?: string | null;
      description?: string;
      endpoints?: string[];
      id?: string;
      input_types?: string[];
      lifecycle?: {
        deprecation_date?: string | null;
        message?: string | null;
        replacement_model_id?: string | null;
        retirement_date?: string | null;
        status?: "active" | "deprecated" | "retired" | null;
      };
      model_id?: string;
      name?: string | null;
      organisation_colour?: string | null;
      organisation_id?: string | null;
      organisation_name?: string | null;
      output_types?: string[];
      per_request_limits?: {
        [key: string]: unknown;
      } | null;
      pricing?: {
        completion?: string | null;
        image?: string | null;
        input_cache_read?: string | null;
        input_cache_write?: string | null;
        prompt?: string | null;
        request?: string | null;
        web_search?: string | null;
      };
      pricing_detail?: {
        meters?: {
          [key: string]: unknown;
        };
        pricing_plan?: string;
      };
      providers?: {
        api_provider_id: string;
        api_provider_name?: string | null;
        availability_reason:
          | "active"
          | "preview_only"
          | "gated"
          | "access_limited"
          | "region_limited"
          | "project_limited"
          | "paused"
          | "soft_blocked"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "internal_testing"
          | "scheduled"
          | "coming_soon"
          | "provider_disabled"
          | "model_disabled"
          | "capability_disabled"
          | "provider_not_ready"
          | "provider_inactive"
          | "inactive"
          | "retired";
        availability_status: "active" | "coming_soon" | "inactive";
        capability_status:
          | "active"
          | "coming_soon"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled"
          | "internal_testing";
        effective_from?: string | null;
        effective_to?: string | null;
        endpoints: string[];
        is_active_gateway: boolean;
        model_routing_status:
          | "active"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled";
        params: string[];
        provider_routing_status:
          | "active"
          | "deranked_lvl1"
          | "deranked_lvl2"
          | "deranked_lvl3"
          | "disabled";
        provider_status:
          | "active"
          | "beta"
          | "alpha"
          | "not_ready"
          | "gated"
          | "access_limited"
          | "region_limited"
          | "project_limited"
          | "paused"
          | "soft_blocked";
      }[];
      release_date?: string | null;
      retirement_date?: string | null;
      status?: string | null;
      supported_parameters?: string[];
      supported_params?: string[];
      top_provider?: {
        context_length?: number | null;
        is_moderated?: boolean;
        max_completion_tokens?: number | null;
      };
      top_provider_id?: string | null;
    }[];
    offset: number;
    ok: boolean;
    privacy_scope: "shared" | "team";
    total: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListVideoModelsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns DB-backed video model/provider capability metadata for the video playground and SDK validation.
 */
export async function listVideoModels(
  client: Client,
  args: ListVideoModelsParams = {},
): Promise<{
  data?: {}[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/videos/models";
  return client.request<{
    data?: {}[];
    object?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListVideoModelsAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos/models.
 */
export async function listVideoModelsAlias(
  client: Client,
  args: ListVideoModelsAliasParams = {},
): Promise<{
  data?: {}[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/video/generations/models";
  return client.request<{
    data?: {}[];
    object?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListVideosParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists async video generation jobs for the authenticated team.
 */
export async function listVideos(
  client: Client,
  args: ListVideosParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/videos";
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListVideosAliasParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /videos.
 */
export async function listVideosAlias(
  client: Client,
  args: ListVideosAliasParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/video/generations";
  return client.request<{
    [key: string]: unknown;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListWorkspacesParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists workspaces owned by the authenticated management key owner. Management API key required.
 */
export async function listWorkspaces(
  client: Client,
  args: ListWorkspacesParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    id: string;
    name: string | null;
    slug: string | null;
    updated_at: string | null;
  }[];
  total_count: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/workspaces";
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      id: string;
      name: string | null;
      slug: string | null;
      updated_at: string | null;
    }[];
    total_count: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type OpenResponsesWebSocketParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Opens a persistent websocket session for OpenAI Responses WebSocket mode.
 * This route is currently experimental on AI Stats Gateway and is not
 * recommended for production workloads.
 *
 * WebSocket handshake uses HTTP GET upgrade semantics and returns `101 Switching Protocols`
 * on success (not `200`).
 *
 * This endpoint is OpenAI-only, requires `openai/<model>` format, and accepts
 * `response.create` websocket messages.
 * The gateway enforces `store=false`, allows one in-flight response per connection,
 * and forwards OpenAI Responses streaming events back to the client.
 *
 * After upgrade, runtime failures are emitted as websocket `error` events
 * (for example `invalid_response_create`, `openai_routing_failed`,
 * `response_already_in_flight`, `model_mismatch`, `upstream_websocket_*`)
 * rather than additional HTTP response codes.
 *
 */
export async function openResponsesWebSocket(
  client: Client,
  args: OpenResponsesWebSocketParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/responses/ws";
  return client.request<unknown>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveBatchParams = {
  path?: {
    batch_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves a previously created batch job.
 */
export async function retrieveBatch(
  client: Client,
  args: RetrieveBatchParams = {},
): Promise<{
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number;
    cost_usd?: number;
    finalized_at?: string;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
  };
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  metadata?: {};
  object?: string;
  output_file_id?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  session_id?: string;
  status?: string;
  webhook?: {
    events?: string[];
    secret?: string;
    url?: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/batches/${encodeURIComponent(String(path?.batch_id))}`;
  return client.request<{
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number;
      cost_usd?: number;
      finalized_at?: string;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
    };
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    metadata?: {};
    object?: string;
    output_file_id?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    session_id?: string;
    status?: string;
    webhook?: {
      events?: string[];
      secret?: string;
      url?: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveBatchAliasParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /batches/{batch_id}.
 */
export async function retrieveBatchAlias(
  client: Client,
  args: RetrieveBatchAliasParams = {},
): Promise<{
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number;
    cost_usd?: number;
    finalized_at?: string;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
  };
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  metadata?: {};
  object?: string;
  output_file_id?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  session_id?: string;
  status?: string;
  webhook?: {
    events?: string[];
    secret?: string;
    url?: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/batch/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    billing?: {
      billed?: boolean;
      charged?: boolean;
      cost_nanos?: number;
      cost_usd?: number;
      finalized_at?: string;
      pricing_breakdown?: {
        [key: string]: unknown;
      };
      reason?: string;
    };
    cancelled_at?: number;
    cancelling_at?: number;
    completed_at?: number;
    completion_window?: string;
    created_at?: number;
    endpoint?: string;
    error_file_id?: string;
    errors?: {};
    expired_at?: number;
    expires_at?: number;
    failed_at?: number;
    finalizing_at?: number;
    id?: string;
    in_progress_at?: number;
    input_file_id?: string;
    metadata?: {};
    object?: string;
    output_file_id?: string;
    pricing_lines?: {
      [key: string]: unknown;
    }[];
    provider?: string;
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    request_id?: string;
    session_id?: string;
    status?: string;
    webhook?: {
      events?: string[];
      secret?: string;
      url?: string;
    };
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveFileParams = {
  path?: {
    file_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves metadata for a file that belongs to the authenticated workspace.
 */
export async function retrieveFile(
  client: Client,
  args: RetrieveFileParams = {},
): Promise<{
  bytes?: number;
  created_at?: number;
  filename?: string;
  id?: string;
  object?: string;
  purpose?: string;
  status?: string;
  status_details?: {};
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/files/${encodeURIComponent(String(path?.file_id))}`;
  return client.request<{
    bytes?: number;
    created_at?: number;
    filename?: string;
    id?: string;
    object?: string;
    purpose?: string;
    status?: string;
    status_details?: {};
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type RetrieveFileContentParams = {
  path?: {
    file_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Retrieves binary content for a previously uploaded file that belongs to the authenticated workspace.
 */
export async function retrieveFileContent(
  client: Client,
  args: RetrieveFileContentParams = {},
): Promise<Blob> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/files/${encodeURIComponent(String(path?.file_id))}/content`;
  return client.request<Blob>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateApiKeyParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    disabled?: boolean;
    expires_at?: string | null;
    include_byok_in_limit?: boolean;
    limit?: number | null;
    limit_reset?: "daily" | "weekly" | "monthly";
    name?: string;
    scopes?: string | string[];
    soft_blocked?: boolean;
  };
};

/**
 * Updates API key metadata or status. Management API key required.
 */
export async function updateApiKey(
  client: Client,
  args: UpdateApiKeyParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    disabled: boolean;
    expires_at: string | null;
    hash: string;
    id: string;
    label: string | null;
    last_used_at: string | null;
    name: string | null;
    prefix: string | null;
    scopes: string | string[];
    soft_blocked: boolean;
    status: string | null;
    updated_at: string | null;
    workspace_id: string;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/keys/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      disabled: boolean;
      expires_at: string | null;
      hash: string;
      id: string;
      label: string | null;
      last_used_at: string | null;
      name: string | null;
      prefix: string | null;
      scopes: string | string[];
      soft_blocked: boolean;
      status: string | null;
      updated_at: string | null;
      workspace_id: string;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateWorkspaceParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    name?: string;
    slug?: string;
  };
};

/**
 * Updates workspace metadata. Management API key required.
 */
export async function updateWorkspace(
  client: Client,
  args: UpdateWorkspaceParams = {},
): Promise<{
  data: {
    created_at: string | null;
    created_by: string | null;
    id: string;
    name: string | null;
    slug: string | null;
    updated_at: string | null;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/workspaces/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    data: {
      created_at: string | null;
      created_by: string | null;
      id: string;
      name: string | null;
      slug: string | null;
      updated_at: string | null;
    };
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UploadFileParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    file: Blob;
    purpose: string;
  };
};

/**
 * Uploads a file for batch processing and returns the upstream file metadata.
 */
export async function uploadFile(
  client: Client,
  args: UploadFileParams = {},
): Promise<{
  bytes?: number;
  created_at?: number;
  filename?: string;
  id?: string;
  object?: string;
  purpose?: string;
  status?: string;
  status_details?: {};
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/files";
  return client.request<{
    bytes?: number;
    created_at?: number;
    filename?: string;
    id?: string;
    object?: string;
    purpose?: string;
    status?: string;
    status_details?: {};
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

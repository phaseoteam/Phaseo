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
    metadata?: {};
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
    };
  };
};

/**
 * Placeholder endpoint. Batch creation is not implemented yet.
 */
export async function createBatch(
  client: Client,
  args: CreateBatchParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batches";
  return client.request<unknown>({
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
    metadata?: {};
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
    };
  };
};

/**
 * Alias of /batches. Currently not implemented.
 */
export async function createBatchAlias(
  client: Client,
  args: CreateBatchAliasParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batch";
  return client.request<unknown>({
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
    tool_choice?: "auto" | "none" | "required" | "gateway:datetime" | {};
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
  object?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    server_tool_use?: {
      datetime_requests?: number;
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
    object?: string;
    usage?: {
      completion_tokens?: number;
      prompt_tokens?: number;
      server_tool_use?: {
        datetime_requests?: number;
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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

export type CreateManagementKeyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    created_by?: string;
    name: string;
    scopes?: string | string[];
    soft_blocked?: boolean;
    status?: "active" | "disabled" | "revoked";
    team_id?: string;
  };
};

/**
 * Creates a new management API key.
 */
export async function createManagementKey(
  client: Client,
  args: CreateManagementKeyParams = {},
): Promise<{
  key: {
    created_at?: string;
    id?: string;
    key?: string;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
  };
  ok: true;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/management/keys";
  return client.request<{
    key: {
      created_at?: string;
      id?: string;
      key?: string;
      name?: string;
      prefix?: string;
      scopes?: string;
      status?: "active" | "disabled" | "revoked";
    };
    ok: true;
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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

export type CreateOAuthClientParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    description?: string;
    homepage_url?: string;
    logo_url?: string;
    name: string;
    privacy_policy_url?: string;
    redirect_uris: string[];
    terms_of_service_url?: string;
  };
};

/**
 * Creates a team-scoped OAuth client.
 */
export async function createOAuthClient(
  client: Client,
  args: CreateOAuthClientParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/oauth-clients";
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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
    safety_identifier?: string | null;
    service_tier?: "auto" | "default" | "flex" | "standard" | "priority";
    store?: boolean;
    stream?: boolean;
    temperature?: number;
    text?: {};
    tool_choice?: "auto" | "none" | "required" | "gateway:datetime" | {};
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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
  seconds?: number;
  size?: string;
  started_at?: number | string | null;
  status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
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
    seconds?: number;
    size?: string;
    started_at?: number | string | null;
    status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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
  seconds?: number;
  size?: string;
  started_at?: number | string | null;
  status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
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
    seconds?: number;
    size?: string;
    started_at?: number | string | null;
    status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
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

export type DeleteManagementKeyParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Permanently deletes a management API key.
 */
export async function deleteManagementKey(
  client: Client,
  args: DeleteManagementKeyParams = {},
): Promise<{
  message: string;
  ok: true;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/management/keys/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    message: string;
    ok: true;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteOAuthClientParams = {
  path?: {
    client_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Deletes an OAuth client and related metadata.
 */
export async function deleteOAuthClient(
  client: Client,
  args: DeleteOAuthClientParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/oauth-clients/${encodeURIComponent(String(path?.client_id))}`;
  return client.request<{
    [key: string]: unknown;
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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
    date?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns user activity data grouped by endpoint for the last 30 completed UTC days.
 */
export async function getActivity(
  client: Client,
  args: GetActivityParams = {},
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
  const resolvedPath = "/activity";
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

export type GetCreditsParams = {
  path?: Record<string, never>;
  query?: {
    team_id: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns the remaining credits and usage statistics for a team.
 */
export async function getCredits(
  client: Client,
  args: GetCreditsParams = {},
): Promise<{
  credits?: {
    remaining?: number;
    thirty_day_requests?: number;
    thirty_day_usage?: number;
  };
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/credits";
  return client.request<{
    credits?: {
      remaining?: number;
      thirty_day_requests?: number;
      thirty_day_usage?: number;
    };
    ok?: boolean;
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

export type GetManagementKeyParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns details of a specific management API key.
 */
export async function getManagementKey(
  client: Client,
  args: GetManagementKeyParams = {},
): Promise<{
  key: {
    created_at?: string;
    created_by?: string;
    id?: string;
    last_used_at?: string | null;
    name?: string;
    prefix?: string;
    scopes?: string;
    soft_blocked?: boolean;
    status?: "active" | "disabled" | "revoked";
    team_id?: string;
  };
  ok: true;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/management/keys/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    key: {
      created_at?: string;
      created_by?: string;
      id?: string;
      last_used_at?: string | null;
      name?: string;
      prefix?: string;
      scopes?: string;
      soft_blocked?: boolean;
      status?: "active" | "disabled" | "revoked";
      team_id?: string;
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

export type GetOAuthClientParams = {
  path?: {
    client_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns details for an OAuth client.
 */
export async function getOAuthClient(
  client: Client,
  args: GetOAuthClientParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/oauth-clients/${encodeURIComponent(String(path?.client_id))}`;
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
  seconds?: number;
  size?: string;
  started_at?: number | string | null;
  status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
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
    seconds?: number;
    size?: string;
    started_at?: number | string | null;
    status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
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
  seconds?: number;
  size?: string;
  started_at?: number | string | null;
  status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
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
    seconds?: number;
    size?: string;
    started_at?: number | string | null;
    status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
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

export type HealthzParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns the health status of the API.
 */
export async function healthz(
  client: Client,
  args: HealthzParams = {},
): Promise<{
  status: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/health";
  return client.request<{
    status: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type InvalidateGatewayKeyCacheParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Bumps cache version for key id/kid and invalidates key cache entries.
 */
export async function invalidateGatewayKeyCache(
  client: Client,
  args: InvalidateGatewayKeyCacheParams = {},
): Promise<{
  cache_version: {
    id: number;
    kid: number | null;
  };
  key: {
    id: string;
    kid?: string | null;
    status?: string | null;
    team_id: string;
  };
  message: string;
  ok: true;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/keys/${encodeURIComponent(String(path?.id))}/invalidate`;
  return client.request<{
    cache_version: {
      id: number;
      kid: number | null;
    };
    key: {
      id: string;
      kid?: string | null;
      status?: string | null;
      team_id: string;
    };
    message: string;
    ok: true;
  }>({
    method: "POST",
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
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
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
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
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
  sample_models?:
    | "ai21/jamba-2-3b"
    | "ai21/jamba-large-1.5"
    | "ai21/jamba-large-1.6"
    | "ai21/jamba-large-1.7"
    | "ai21/jamba-mini-1.5"
    | "ai21/jamba-mini-1.6"
    | "ai21/jamba-mini-1.7"
    | "ai21/jamba-mini-2"
    | "ai21/jamba-reasoning-3b"
    | "aion-labs/aion-1.0"
    | "aion-labs/aion-1.0-mini"
    | "aion-labs/aion-2.0"
    | "aion-labs/aion-2.5"
    | "aion-labs/aion-rp-llama-3.1-8b"
    | "allenai/bolmo-1b"
    | "allenai/bolmo-7b"
    | "allenai/molmo-2-4b"
    | "allenai/molmo-2-8b"
    | "allenai/olmo-3-32b-think"
    | "allenai/olmo-3-7b-instruct"
    | "allenai/olmo-3-7b-think"
    | "allenai/olmo-3.1-32b-instruct"
    | "allenai/olmo-3.1-32b-think"
    | "amazon/nova-2-lite"
    | "amazon/nova-2-omni"
    | "amazon/nova-2-pro"
    | "amazon/nova-2-sonic"
    | "amazon/nova-canvas"
    | "amazon/nova-lite-1.0"
    | "amazon/nova-micro-1.0"
    | "amazon/nova-multimodal-embeddings"
    | "amazon/nova-premier"
    | "amazon/nova-pro-1.0"
    | "amazon/nova-reel"
    | "amazon/nova-sonic"
    | "anthropic/claude-1.0"
    | "anthropic/claude-1.1"
    | "anthropic/claude-1.2"
    | "anthropic/claude-1.3"
    | "anthropic/claude-2.0"
    | "anthropic/claude-2.1"
    | "anthropic/claude-3-haiku"
    | "anthropic/claude-3-opus"
    | "anthropic/claude-3-sonnet"
    | "anthropic/claude-3.5-haiku"
    | "anthropic/claude-3.5-sonnet-2024-06-20"
    | "anthropic/claude-3.5-sonnet-2024-10-22"
    | "anthropic/claude-3.7-sonnet"
    | "anthropic/claude-haiku-4.5"
    | "anthropic/claude-instant-1.0"
    | "anthropic/claude-instant-1.1"
    | "anthropic/claude-instant-1.2"
    | "anthropic/claude-opus-4"
    | "anthropic/claude-opus-4.1"
    | "anthropic/claude-opus-4.5"
    | "anthropic/claude-opus-4.6"
    | "anthropic/claude-sonnet-4"
    | "anthropic/claude-sonnet-4.5"
    | "anthropic/claude-sonnet-4.6"
    | "arcee-ai/trinity-large"
    | "arcee-ai/trinity-large-thinking"
    | "arcee-ai/trinity-mini"
    | "arcee-ai/trinity-nano-preview"
    | "baidu/ernie-4.5-21b-a3b"
    | "baidu/ernie-4.5-21b-a3b-thinking"
    | "baidu/ernie-4.5-300b-a47b"
    | "baidu/ernie-4.5-turbo"
    | "baidu/ernie-4.5-vl-28b-a3b"
    | "baidu/ernie-4.5-vl-424b-a47b"
    | "baidu/ernie-5.0"
    | "baidu/ernie-5.0-0110"
    | "baidu/ernie-5.0-preview-1203"
    | "baidu/ernie-5.0-preview-1220"
    | "baidu/ernie-x1.1"
    | "baidu/qianfan-vl-3b"
    | "baidu/qianfan-vl-70b"
    | "baidu/qianfan-vl-8b"
    | "black-forest-labs/flux-2-dev"
    | "black-forest-labs/flux-2-flex"
    | "black-forest-labs/flux-2-klein-4b"
    | "black-forest-labs/flux-2-klein-9b"
    | "black-forest-labs/flux-2-max"
    | "black-forest-labs/flux-2-pro"
    | "bytedance/seed-1.6-2025-06-15"
    | "bytedance/seed-1.6-2025-09-15"
    | "bytedance/seed-1.6-flash-2025-06-15"
    | "bytedance/seed-1.6-flash-2025-07-15"
    | "bytedance/seed-1.8"
    | "bytedance/seed-2.0-lite"
    | "bytedance/seed-2.0-mini"
    | "bytedance/seed-2.0-pro"
    | "bytedance/seed-coder-8b-instruct"
    | "bytedance/seed-coder-8b-reasoning"
    | "bytedance/seed-oss-36b-instruct"
    | "bytedance/seed-translation"
    | "bytedance/seedream-4.5"
    | "cohere/c4ai-aya-expanse-32b"
    | "cohere/c4ai-aya-expanse-8b"
    | "cohere/c4ai-aya-vision-32b"
    | "cohere/c4ai-aya-vision-8b"
    | "cohere/command"
    | "cohere/command-a"
    | "cohere/command-a-reasoning"
    | "cohere/command-a-translate"
    | "cohere/command-a-vision"
    | "cohere/command-light"
    | "cohere/command-r--2024-04-04"
    | "cohere/command-r--2024-08-30"
    | "cohere/command-r-2024-03-11"
    | "cohere/command-r-2024-08-30"
    | "cohere/command-r-7b"
    | "cohere/embed-english-light-v2.0"
    | "cohere/embed-english-light-v3"
    | "cohere/embed-english-v2.0"
    | "cohere/embed-english-v3"
    | "cohere/embed-multilingual-light-v3"
    | "cohere/embed-multilingual-v2.0"
    | "cohere/embed-multilingual-v3"
    | "cohere/embed-v4"
    | "cohere/rerank-multilingual-v3"
    | "cohere/rerank-v3.5"
    | "cohere/rerank-v4.0-fast"
    | "cohere/rerank-v4.0-pro"
    | "cohere/rerenk-english-v3"
    | "cursor/composer-1"
    | "cursor/composer-1.5"
    | "deepseek/deepseek-coder-v2-2024-06-14"
    | "deepseek/deepseek-coder-v2-2024-07-27"
    | "deepseek/deepseek-ocr"
    | "deepseek/deepseek-ocr-2"
    | "deepseek/deepseek-r1-2025-01-20"
    | "deepseek/deepseek-r1-2025-05-28"
    | "deepseek/deepseek-r1-lite-preview"
    | "deepseek/deepseek-v2-2024-05-17"
    | "deepseek/deepseek-v2-2024-06-28"
    | "deepseek/deepseek-v2.5-2024-09-05"
    | "deepseek/deepseek-v2.5-2024-12-10"
    | "deepseek/deepseek-v3-2024-12-26"
    | "deepseek/deepseek-v3-2025-03-24"
    | "deepseek/deepseek-v3.1"
    | "deepseek/deepseek-v3.1-terminus"
    | "deepseek/deepseek-v3.2"
    | "deepseek/deepseek-v3.2-exp"
    | "deepseek/deepseek-v3.2-speciale"
    | "deepseek/deepseek-v4"
    | "deepseek/deepseek-vl2"
    | "deepseek/deepseek-vl2-small"
    | "deepseek/deepseek-vl2-tiny"
    | "eleven-labs/eleven-english-sts-v2"
    | "eleven-labs/eleven-flash-v2"
    | "eleven-labs/eleven-flash-v2.5"
    | "eleven-labs/eleven-monolingual-v1"
    | "eleven-labs/eleven-multilingual-sts-v2"
    | "eleven-labs/eleven-multilingual-ttv-v2"
    | "eleven-labs/eleven-multilingual-v1"
    | "eleven-labs/eleven-multilingual-v2"
    | "eleven-labs/eleven-ttv-v3"
    | "eleven-labs/eleven-turbo-v2"
    | "eleven-labs/eleven-turbo-v2.5"
    | "eleven-labs/eleven-v3"
    | "eleven-labs/scribe-v1"
    | "eleven-labs/scribe-v2"
    | "eleven-labs/scribe-v2-realtime"
    | "essential-ai/rnj-1"
    | "google/chat-bison"
    | "google/code-gecko"
    | "google/embedding-001"
    | "google/gemini-1.0-nano"
    | "google/gemini-1.0-pro"
    | "google/gemini-1.0-pro-vision-001"
    | "google/gemini-1.0-ultra"
    | "google/gemini-1.5-flash-001"
    | "google/gemini-1.5-flash-002"
    | "google/gemini-1.5-flash-8b"
    | "google/gemini-1.5-flash-8b-exp-2024-08-27"
    | "google/gemini-1.5-flash-8b-exp-2024-09-24"
    | "google/gemini-1.5-flash-preview-2024-05-14"
    | "google/gemini-1.5-pro-001"
    | "google/gemini-1.5-pro-002"
    | "google/gemini-1.5-pro-exp-2024-08-01"
    | "google/gemini-1.5-pro-exp-2024-08-27"
    | "google/gemini-2.0-flash"
    | "google/gemini-2.0-flash-exp"
    | "google/gemini-2.0-flash-exp-image-generation"
    | "google/gemini-2.0-flash-lite"
    | "google/gemini-2.0-flash-live-001"
    | "google/gemini-2.0-flash-preview-image-generation"
    | "google/gemini-2.0-flash-thinking-exp-2024-12-19"
    | "google/gemini-2.0-flash-thinking-exp-2025-01-21"
    | "google/gemini-2.0-pro-exp"
    | "google/gemini-2.5-computer-use-preview"
    | "google/gemini-2.5-flash-exp-native-audio-thinking-dialog"
    | "google/gemini-2.5-flash-image"
    | "google/gemini-2.5-flash-image-preview"
    | "google/gemini-2.5-flash-lite-preview-2025-06-17"
    | "google/gemini-2.5-flash-lite-preview-2025-09-25"
    | "google/gemini-2.5-flash-native-audio-preview-2025-09-03"
    | "google/gemini-2.5-flash-preview-2025-04-17"
    | "google/gemini-2.5-flash-preview-2025-05-20"
    | "google/gemini-2.5-flash-preview-2025-09-25"
    | "google/gemini-2.5-flash-preview-native-audio-dialog"
    | "google/gemini-2.5-flash-preview-tts-2025-05-20"
    | "google/gemini-2.5-flash-preview-tts-2025-12-10"
    | "google/gemini-2.5-pro-experimental-2025-03-25"
    | "google/gemini-2.5-pro-preview-2025-05-06"
    | "google/gemini-2.5-pro-preview-2025-06-05"
    | "google/gemini-2.5-pro-preview-tts"
    | "google/gemini-2.5-pro-preview-tts-2025-05-20"
    | "google/gemini-3-flash-preview"
    | "google/gemini-3-pro-image-preview"
    | "google/gemini-3-pro-preview"
    | "google/gemini-3.1-flash-image-preview"
    | "google/gemini-3.1-flash-lite-preview"
    | "google/gemini-3.1-pro-preview"
    | "google/gemini-3.1-pro-preview-customtools"
    | "google/gemini-diffusion"
    | "google/gemini-embedding-001"
    | "google/gemini-embedding-2-preview"
    | "google/gemini-embedding-exp-0307"
    | "google/gemini-exp-1114"
    | "google/gemini-exp-1121"
    | "google/gemini-exp-1206"
    | "google/gemini-live-2.5-flash-preview"
    | "google/gemini-robotics-er-1.5-preview"
    | "google/gemma-1-2b"
    | "google/gemma-1-7b"
    | "google/gemma-2-27b"
    | "google/gemma-2-2b"
    | "google/gemma-2-9b"
    | "google/gemma-3-12b"
    | "google/gemma-3-1b"
    | "google/gemma-3-27b"
    | "google/gemma-3-4b"
    | "google/gemma-3n-e2b"
    | "google/gemma-3n-e4b"
    | "google/image-generation-002"
    | "google/image-generation-005"
    | "google/image-generation-006"
    | "google/image-text"
    | "google/imagen-3.0-generate-001"
    | "google/imagen-3.0-generate-002"
    | "google/imagen-4.0-fast-generate-001"
    | "google/imagen-4.0-fast-generate-preview"
    | "google/imagen-4.0-generate-001"
    | "google/imagen-4.0-generate-preview"
    | "google/imagen-4.0-preview"
    | "google/imagen-4.0-ultra-generate-001"
    | "google/imagen-4.0-ultra-generate-preview"
    | "google/imagen-4.0-ultra-preview"
    | "google/learnlm-1.5-pro-experimental"
    | "google/learnlm-2.0-flash-experimental"
    | "google/lyria-1"
    | "google/lyria-2"
    | "google/lyria-3"
    | "google/medgemma-1.5-4b"
    | "google/multimodal-embedding-001"
    | "google/text-bison"
    | "google/text-embedding-004"
    | "google/text-embedding-005"
    | "google/text-embedding-gecko-001"
    | "google/text-embedding-gecko-002"
    | "google/text-embedding-gecko-003"
    | "google/text-embedding-gecko-multilingual-001"
    | "google/text-multilingual-embedding-002"
    | "google/translategemma-12b"
    | "google/translategemma-27b"
    | "google/translategemma-4b"
    | "google/veo-2"
    | "google/veo-3"
    | "google/veo-3-fast"
    | "google/veo-3.0-fast-generate-preview"
    | "google/veo-3.0-generate-preview"
    | "google/veo-3.1-fast-preview"
    | "google/veo-3.1-lite-preview"
    | "google/veo-3.1-preview"
    | "google/veo-3.2"
    | "google/veo-4"
    | "ibm/granite-20b-code-instruct-8k"
    | "ibm/granite-3.0-1b-a400m-instruct"
    | "ibm/granite-3.0-2b-instruct"
    | "ibm/granite-3.0-3b-a800m-instruct"
    | "ibm/granite-3.0-8b-instruct"
    | "ibm/granite-3.1-1b-a400m-instruct"
    | "ibm/granite-3.1-2b-instruct"
    | "ibm/granite-3.1-3b-a800m-instruct"
    | "ibm/granite-3.1-8b-instruct"
    | "ibm/granite-3.2-2b-instruct"
    | "ibm/granite-3.2-8b-instruct"
    | "ibm/granite-3.2-8b-instruct-preview"
    | "ibm/granite-3.3-2b-instruct"
    | "ibm/granite-3.3-8b-instruct"
    | "ibm/granite-34b-code-instruct-8b"
    | "ibm/granite-3b-code-instruct-128k"
    | "ibm/granite-3b-code-instruct-2k"
    | "ibm/granite-4.0-micro"
    | "ibm/granite-4.0-small"
    | "ibm/granite-4.0-tiny"
    | "ibm/granite-4.0-tiny-preview"
    | "ibm/granite-8b-code-instruct-128k"
    | "ibm/granite-8b-code-instruct-4k"
    | "ibm/granite-embedding-107m-multilingual"
    | "ibm/granite-embedding-125m-english"
    | "ibm/granite-embedding-278m-multilingual"
    | "ibm/granite-embedding-30m-english"
    | "ibm/granite-embedding-english-r2"
    | "ibm/granite-embedding-reranker-english-r2"
    | "ibm/granite-embedding-small-english-r2"
    | "ibm/granite-guardian-3.0-2b"
    | "ibm/granite-guardian-3.0-8b"
    | "ibm/granite-guardian-3.1-2b"
    | "ibm/granite-guardian-3.1-8b"
    | "ibm/granite-guardian-3.2-5b"
    | "ibm/granite-guardian-3.3-8b"
    | "ibm/granite-speech-3.2-8b"
    | "ibm/granite-speech-3.3-2b"
    | "ibm/granite-speech-3.3-8b"
    | "ibm/granite-vision-3.1-2b-preview"
    | "ibm/granite-vision-3.2-2b"
    | "ibm/granite-vision-3.3-2b"
    | "ibm/granite-vision-3.3-2b-embedding"
    | "inception/mercury-2"
    | "inclusionai/ring-1t-2.5"
    | "kwaipilot/kat-coder-exp-72b-1010"
    | "kwaipilot/kat-coder-pro"
    | "kwaipilot/kat-coder-pro-v2"
    | "lg/exaone-3.0"
    | "lg/exaone-3.5-2.4b"
    | "lg/exaone-3.5-32b"
    | "lg/exaone-3.5-7.8b"
    | "lg/exaone-4.0-1.2b"
    | "lg/exaone-4.0-32b"
    | "lg/exaone-deep-2.4b"
    | "lg/exaone-deep-32b"
    | "lg/exaone-deep-7.8b"
    | "lg/k-exaone"
    | "liquid-ai/lfm-2-1.2b"
    | "liquid-ai/lfm-2-2.6b"
    | "liquid-ai/lfm-2-24b-a2b"
    | "liquid-ai/lfm-2-350m"
    | "liquid-ai/lfm-2-700m"
    | "liquid-ai/lfm-2-8b-a1b"
    | "liquid-ai/lfm-2.5-1.2b"
    | "liquid-ai/lfm-2.5-1.2b-jp"
    | "liquid-ai/lfm-2.5-1.2b-thinking"
    | "liquid-ai/lfm-2.5-audio-1.5b"
    | "liquid-ai/lfm-2.5-vl-1.6b"
    | "meituan/longcat-flash-cat"
    | "meta/llama-2-13b-chat"
    | "meta/llama-2-70b-chat"
    | "meta/llama-2-7b-chat"
    | "meta/llama-3-70b"
    | "meta/llama-3-8b"
    | "meta/llama-3.1-405b"
    | "meta/llama-3.1-70b"
    | "meta/llama-3.1-8b"
    | "meta/llama-3.2-11b-vision"
    | "meta/llama-3.2-1b"
    | "meta/llama-3.2-3b"
    | "meta/llama-3.2-90b-vision"
    | "meta/llama-3.3-70b"
    | "meta/llama-4-maverick"
    | "meta/llama-4-scout"
    | "microsoft/phi-1"
    | "microsoft/phi-1.5"
    | "microsoft/phi-2"
    | "microsoft/phi-3-medium-128k-instruct"
    | "microsoft/phi-3-medium-4k-instruct"
    | "microsoft/phi-3-mini-128k-instruct"
    | "microsoft/phi-3-small-128k-instruct"
    | "microsoft/phi-3-small-8k-instruct"
    | "microsoft/phi-3-vision-128k-instruct"
    | "microsoft/phi-3.5-mini-instruct"
    | "microsoft/phi-3.5-moe-instruct"
    | "microsoft/phi-3.5-vision-instruct"
    | "microsoft/phi-4"
    | "microsoft/phi-4-mini"
    | "microsoft/phi-4-mini-flash-reasoning"
    | "microsoft/phi-4-mini-reasoning"
    | "microsoft/phi-4-multimodal-instruct"
    | "microsoft/phi-4-reasoning"
    | "microsoft/phi-4-reasoning-plus"
    | "minimax/hailuo-02"
    | "minimax/hailuo-2.3"
    | "minimax/hailuo-2.3-fast"
    | "minimax/i2v-01-director"
    | "minimax/i2v-01-live"
    | "minimax/image-01"
    | "minimax/minimax-m1-40k"
    | "minimax/minimax-m1-80k"
    | "minimax/minimax-m2"
    | "minimax/minimax-m2-her"
    | "minimax/minimax-m2.1"
    | "minimax/minimax-m2.5"
    | "minimax/minimax-m2.7"
    | "minimax/minimax-text-01"
    | "minimax/minimax-vl-01"
    | "minimax/music-1.5"
    | "minimax/music-2.0"
    | "minimax/music-2.5"
    | "minimax/s2v-01"
    | "minimax/speech-01-hd"
    | "minimax/speech-01-turbo"
    | "minimax/speech-02-hd"
    | "minimax/speech-02-turbo"
    | "minimax/speech-2.5-hd-preview"
    | "minimax/speech-2.5-turbo-preview"
    | "minimax/speech-2.6"
    | "minimax/t2v-01-director"
    | "mistral/codestral"
    | "mistral/codestral-2024-05-29"
    | "mistral/codestral-2025-01-13"
    | "mistral/codestral-embed"
    | "mistral/codestral-mamba-7b"
    | "mistral/devstral-2.0"
    | "mistral/devstral-medium-1.0"
    | "mistral/devstral-small-1.0"
    | "mistral/devstral-small-1.1"
    | "mistral/devstral-small-2.0"
    | "mistral/leanstral"
    | "mistral/magistral-medium-1.0"
    | "mistral/magistral-medium-1.1"
    | "mistral/magistral-medium-1.2"
    | "mistral/magistral-small-1.0"
    | "mistral/magistral-small-1.1"
    | "mistral/magistral-small-1.2"
    | "mistral/mathstral-7b"
    | "mistral/ministral-3.0-14b"
    | "mistral/ministral-3.0-3b"
    | "mistral/ministral-3.0-8b"
    | "mistral/ministral-3b"
    | "mistral/ministral-8b"
    | "mistral/mistral-7b"
    | "mistral/mistral-7b-2023-09-27"
    | "mistral/mistral-7b-2023-12-11"
    | "mistral/mistral-embed"
    | "mistral/mistral-large-1.0"
    | "mistral/mistral-large-2.0"
    | "mistral/mistral-large-2.1"
    | "mistral/mistral-large-3.0"
    | "mistral/mistral-medium-1.0"
    | "mistral/mistral-medium-3.0"
    | "mistral/mistral-medium-3.1"
    | "mistral/mistral-moderation"
    | "mistral/mistral-moderation-2"
    | "mistral/mistral-nemo-12b"
    | "mistral/mistral-ocr"
    | "mistral/mistral-ocr-2"
    | "mistral/mistral-saba"
    | "mistral/mistral-small-1.0"
    | "mistral/mistral-small-2.0"
    | "mistral/mistral-small-3.0"
    | "mistral/mistral-small-3.1"
    | "mistral/mistral-small-3.2"
    | "mistral/mistral-small-4"
    | "mistral/mistral-small-creative"
    | "mistral/mixtral-8x22b"
    | "mistral/mixtral-8x7b"
    | "mistral/ocr-3"
    | "mistral/pixtral-12b"
    | "mistral/pixtral-large"
    | "mistral/voxtral-mini"
    | "mistral/voxtral-mini-transcribe"
    | "mistral/voxtral-mini-transcribe-2"
    | "mistral/voxtral-small"
    | "moonshotai/kimi-k1.5"
    | "moonshotai/kimi-k2"
    | "moonshotai/kimi-k2-2025-07-11"
    | "moonshotai/kimi-k2-thinking"
    | "moonshotai/kimi-k2.5"
    | "moonshotai/kimi-linear-48b"
    | "moonshotai/kimi-vl-a3b"
    | "moonshotai/kimi-vl-a3b-thinking"
    | "moonshotai/kimi-vl-a3b-thinking-2025-04-09"
    | "naver-hyperclova/hyperclova-x-seed-omni-8b"
    | "naver-hyperclova/hyperclova-x-seed-think-14b"
    | "naver-hyperclova/hyperclova-x-seed-think-32b"
    | "nous/hermes-2-llama-2-70b"
    | "nous/hermes-2-pro-llama-3-70b"
    | "nous/hermes-2-pro-llama-3-8b"
    | "nous/hermes-2-pro-mistral-7b"
    | "nous/hermes-2-theta-llama-3-70b"
    | "nous/hermes-2-theta-llama-3-8b"
    | "nous/hermes-3-llama-3.1-405b"
    | "nous/hermes-3-llama-3.1-70b"
    | "nous/hermes-3-llama-3.1-8b"
    | "nous/hermes-3-llama-3.2-3b"
    | "nous/hermes-4-14b"
    | "nous/hermes-4-405b"
    | "nous/hermes-4-70b"
    | "nous/hermes-4.3-36b"
    | "nous/nomos-1"
    | "nous/nouscoder-14b"
    | "nvidia/llama-3.1-nemotron-70b-instruct"
    | "nvidia/llama-3.1-nemotron-nano-4b-v1.1"
    | "nvidia/llama-3.1-nemotron-nano-8b-v1"
    | "nvidia/llama-3.1-nemotron-ultra-253b-v1"
    | "nvidia/llama-3.3-nemotron-super-49b-v1"
    | "nvidia/llama-3.3-nemotron-super-49b-v1.5"
    | "nvidia/nemotron-3-nano-30b-a3b"
    | "nvidia/nemotron-3-super-120b-a12b"
    | "nvidia/nvidia-nemotron-nano-12b-v2"
    | "nvidia/nvidia-nemotron-nano-9b-v2"
    | "nvidia/openreasoning-nemotron-1.5b"
    | "nvidia/openreasoning-nemotron-14b"
    | "nvidia/openreasoning-nemotron-32b"
    | "nvidia/openreasoning-nemotron-7b"
    | "openai/ada"
    | "openai/babbage"
    | "openai/babbage-002"
    | "openai/chatgpt-4o"
    | "openai/chatgpt-image-latest"
    | "openai/code-cushman-001"
    | "openai/code-cushman-002"
    | "openai/code-davinci-001"
    | "openai/code-davinci-002"
    | "openai/code-davinci-edit-001"
    | "openai/code-search-ada-code-001"
    | "openai/code-search-ada-text-001"
    | "openai/code-search-babbage-code-001"
    | "openai/code-search-babbage-text-001"
    | "openai/codex-mini"
    | "openai/computer-use-preview"
    | "openai/curie"
    | "openai/dall-e"
    | "openai/dall-e-2"
    | "openai/dall-e-3"
    | "openai/davinci"
    | "openai/davinci-002"
    | "openai/gpt-1"
    | "openai/gpt-2"
    | "openai/gpt-3"
    | "openai/gpt-3.5-turbo-0613"
    | "openai/gpt-3.5-turbo-16k-0613"
    | "openai/gpt-3.5-turbo-2023-11-06"
    | "openai/gpt-3.5-turbo-2024-01-25"
    | "openai/gpt-3.5-turbo-instruct"
    | "openai/gpt-4"
    | "openai/gpt-4-2023-03-14"
    | "openai/gpt-4-32k"
    | "openai/gpt-4-32k-0314"
    | "openai/gpt-4-32k-0613"
    | "openai/gpt-4-turbo"
    | "openai/gpt-4-turbo-2023-03-14"
    | "openai/gpt-4-turbo-2023-11-06"
    | "openai/gpt-4.1"
    | "openai/gpt-4.1-mini"
    | "openai/gpt-4.1-nano"
    | "openai/gpt-4.5"
    | "openai/gpt-4o"
    | "openai/gpt-4o-2024-05-13"
    | "openai/gpt-4o-2024-08-06"
    | "openai/gpt-4o-audio"
    | "openai/gpt-4o-audio-2024-10-01"
    | "openai/gpt-4o-audio-2024-12-17"
    | "openai/gpt-4o-mini"
    | "openai/gpt-4o-mini-audio-preview"
    | "openai/gpt-4o-mini-realtime-preview"
    | "openai/gpt-4o-mini-search-preview"
    | "openai/gpt-4o-mini-transcribe"
    | "openai/gpt-4o-mini-transcribe-2025-03-20"
    | "openai/gpt-4o-mini-tts"
    | "openai/gpt-4o-mini-tts-2025-03-20"
    | "openai/gpt-4o-realtime-preview"
    | "openai/gpt-4o-realtime-preview-2024-10-01"
    | "openai/gpt-4o-realtime-preview-2024-12-17"
    | "openai/gpt-4o-search-preview"
    | "openai/gpt-4o-transcribe"
    | "openai/gpt-4o-transcribe-diarize"
    | "openai/gpt-5"
    | "openai/gpt-5-chat"
    | "openai/gpt-5-codex"
    | "openai/gpt-5-codex-mini"
    | "openai/gpt-5-mini"
    | "openai/gpt-5-nano"
    | "openai/gpt-5-pro"
    | "openai/gpt-5-search-api"
    | "openai/gpt-5.1"
    | "openai/gpt-5.1-chat"
    | "openai/gpt-5.1-codex"
    | "openai/gpt-5.1-codex-max"
    | "openai/gpt-5.1-codex-mini"
    | "openai/gpt-5.1-pro"
    | "openai/gpt-5.2"
    | "openai/gpt-5.2-chat"
    | "openai/gpt-5.2-codex"
    | "openai/gpt-5.2-mini"
    | "openai/gpt-5.2-pro"
    | "openai/gpt-5.3-chat"
    | "openai/gpt-5.3-codex"
    | "openai/gpt-5.3-codex-spark"
    | "openai/gpt-5.4"
    | "openai/gpt-5.4-mini"
    | "openai/gpt-5.4-nano"
    | "openai/gpt-5.4-pro"
    | "openai/gpt-audio"
    | "openai/gpt-audio-1.5"
    | "openai/gpt-audio-mini"
    | "openai/gpt-audio-mini-2025-10-06"
    | "openai/gpt-image-1"
    | "openai/gpt-image-1-mini"
    | "openai/gpt-image-1.5"
    | "openai/gpt-oss-120b"
    | "openai/gpt-oss-20b"
    | "openai/gpt-oss-safeguard-120b"
    | "openai/gpt-oss-safeguard-20b"
    | "openai/gpt-realtime"
    | "openai/gpt-realtime-1.5"
    | "openai/gpt-realtime-mini"
    | "openai/gpt-realtime-mini-2025-10-06"
    | "openai/o1"
    | "openai/o1-mini"
    | "openai/o1-preview"
    | "openai/o1-pro"
    | "openai/o3"
    | "openai/o3-deep-research"
    | "openai/o3-mini"
    | "openai/o3-preview"
    | "openai/o3-pro"
    | "openai/o4-mini"
    | "openai/o4-mini-deep-research"
    | "openai/omni-moderation"
    | "openai/sora-1"
    | "openai/sora-2"
    | "openai/sora-2-2025-09-30"
    | "openai/sora-2-pro"
    | "openai/text-ada-001"
    | "openai/text-babbage-001"
    | "openai/text-curie-001"
    | "openai/text-davinci-001"
    | "openai/text-davinci-002"
    | "openai/text-davinci-003"
    | "openai/text-davinci-edit-001"
    | "openai/text-embedding-3-large"
    | "openai/text-embedding-3-small"
    | "openai/text-embedding-ada-002"
    | "openai/text-moderation-007"
    | "openai/text-search-ada-doc-001"
    | "openai/text-search-ada-query-001"
    | "openai/text-search-babbage-doc-001"
    | "openai/text-search-babbage-query-001"
    | "openai/text-search-curie-doc-001"
    | "openai/text-search-curie-query-001"
    | "openai/text-search-davinci-doc-001"
    | "openai/text-search-davinci-query-001"
    | "openai/text-similarity-ada-001"
    | "openai/text-similarity-babbage-001"
    | "openai/text-similarity-curie-001"
    | "openai/text-similarity-davinci-001"
    | "openai/tts-1"
    | "openai/tts-1-hd"
    | "openai/whisper-1"
    | "openai/whisper-3"
    | "openai/whisper-3-turbo"
    | "prime-intellect/intellect-3"
    | "prime-intellect/intellect-3.1"
    | "qwen/code-qwen-1.5-7b"
    | "qwen/qvq-72b-preview"
    | "qwen/qwen-1.8b"
    | "qwen/qwen-14b"
    | "qwen/qwen-72b"
    | "qwen/qwen-7b"
    | "qwen/qwen-audio"
    | "qwen/qwen-audio-chat"
    | "qwen/qwen-image"
    | "qwen/qwen-image-2512"
    | "qwen/qwen-image-edit"
    | "qwen/qwen-image-edit-2509"
    | "qwen/qwen-image-edit-2511"
    | "qwen/qwen-image-layered"
    | "qwen/qwen-vl"
    | "qwen/qwen1.5-0.5b"
    | "qwen/qwen1.5-1.8b"
    | "qwen/qwen1.5-110b"
    | "qwen/qwen1.5-14b"
    | "qwen/qwen1.5-32b"
    | "qwen/qwen1.5-4b"
    | "qwen/qwen1.5-72b"
    | "qwen/qwen1.5-7b"
    | "qwen/qwen1.5-moe-a2.7b"
    | "qwen/qwen2-0.5b"
    | "qwen/qwen2-1.5b"
    | "qwen/qwen2-72b"
    | "qwen/qwen2-7b"
    | "qwen/qwen2-audio-7b"
    | "qwen/qwen2-math-1.5b"
    | "qwen/qwen2-math-72b"
    | "qwen/qwen2-math-7b"
    | "qwen/qwen2-math-rm-72b"
    | "qwen/qwen2-vl-2b"
    | "qwen/qwen2-vl-72b"
    | "qwen/qwen2-vl-7b"
    | "qwen/qwen2.5-0.5b"
    | "qwen/qwen2.5-1.5b"
    | "qwen/qwen2.5-14b"
    | "qwen/qwen2.5-32b"
    | "qwen/qwen2.5-3b"
    | "qwen/qwen2.5-72b"
    | "qwen/qwen2.5-7b"
    | "qwen/qwen2.5-coder-0.5b"
    | "qwen/qwen2.5-coder-1.5b"
    | "qwen/qwen2.5-coder-14b"
    | "qwen/qwen2.5-coder-32b"
    | "qwen/qwen2.5-coder-3b"
    | "qwen/qwen2.5-coder-7b"
    | "qwen/qwen2.5-math-1.5b"
    | "qwen/qwen2.5-math-72b"
    | "qwen/qwen2.5-math-7b"
    | "qwen/qwen2.5-math-7b-prm800k"
    | "qwen/qwen2.5-math-prm-72b"
    | "qwen/qwen2.5-math-prm-7b"
    | "qwen/qwen2.5-math-rm-72b"
    | "qwen/qwen2.5-omni-3b"
    | "qwen/qwen2.5-omni-7b"
    | "qwen/qwen2.5-vl-32b"
    | "qwen/qwen2.5-vl-3b"
    | "qwen/qwen2.5-vl-72b"
    | "qwen/qwen2.5-vl-7b"
    | "qwen/qwen3-0.6b"
    | "qwen/qwen3-1.7b"
    | "qwen/qwen3-14b"
    | "qwen/qwen3-235b-a22b"
    | "qwen/qwen3-235b-a22b-2507"
    | "qwen/qwen3-235b-a22b-thinking-2507"
    | "qwen/qwen3-30b-a3b"
    | "qwen/qwen3-30b-a3b-instruct-2507"
    | "qwen/qwen3-30b-a3b-thinking-2507"
    | "qwen/qwen3-32b"
    | "qwen/qwen3-4b"
    | "qwen/qwen3-4b-instruct-2507"
    | "qwen/qwen3-4b-saferl"
    | "qwen/qwen3-4b-thinking-2507"
    | "qwen/qwen3-8b"
    | "qwen/qwen3-asr-0.6b"
    | "qwen/qwen3-asr-1.7b"
    | "qwen/qwen3-coder-30b-a3b"
    | "qwen/qwen3-coder-480b-a35b"
    | "qwen/qwen3-coder-next"
    | "qwen/qwen3-embedding-0.6b"
    | "qwen/qwen3-embedding-4b"
    | "qwen/qwen3-embedding-8b"
    | "qwen/qwen3-forcedaligner-0.6b"
    | "qwen/qwen3-guard-gen-0.6b"
    | "qwen/qwen3-guard-gen-4b"
    | "qwen/qwen3-guard-gen-8b"
    | "qwen/qwen3-guard-stream-0.6b"
    | "qwen/qwen3-guard-stream-4b"
    | "qwen/qwen3-guard-stream-8b"
    | "qwen/qwen3-max-thinking"
    | "qwen/qwen3-next-80b-a3b-instruct"
    | "qwen/qwen3-next-80b-a3b-thinking"
    | "qwen/qwen3-omni-30b-a3b-captioner"
    | "qwen/qwen3-omni-30b-a3b-instruct"
    | "qwen/qwen3-omni-30b-a3b-thinking"
    | "qwen/qwen3-omni-flash"
    | "qwen/qwen3-omni-flash-2025-09-15"
    | "qwen/qwen3-reranker-0.6b"
    | "qwen/qwen3-reranker-4b"
    | "qwen/qwen3-reranker-8b"
    | "qwen/qwen3-tts"
    | "qwen/qwen3-tts-12hz-0.6b-base"
    | "qwen/qwen3-tts-12hz-0.6b-customvoice"
    | "qwen/qwen3-tts-12hz-1.7b-base"
    | "qwen/qwen3-tts-12hz-1.7b-voicedesign"
    | "qwen/qwen3-tts-tokenizer-12hz"
    | "qwen/qwen3-vl-235b-a22b-instruct"
    | "qwen/qwen3-vl-235b-a22b-thinking"
    | "qwen/qwen3-vl-2b-instruct"
    | "qwen/qwen3-vl-2b-thinking"
    | "qwen/qwen3-vl-30b-a3b-instruct"
    | "qwen/qwen3-vl-30b-a3b-thinking"
    | "qwen/qwen3-vl-32b-instruct"
    | "qwen/qwen3-vl-32b-thinking"
    | "qwen/qwen3-vl-4b-instruct"
    | "qwen/qwen3-vl-4b-thinking"
    | "qwen/qwen3-vl-8b-instruct"
    | "qwen/qwen3-vl-8b-thinking"
    | "qwen/qwen3-vl-embedding-2b"
    | "qwen/qwen3-vl-embedding-8b"
    | "qwen/qwen3-vl-reranker-2b"
    | "qwen/qwen3-vl-reranker-8b"
    | "qwen/qwen3.5-0.8b"
    | "qwen/qwen3.5-122b-a10b"
    | "qwen/qwen3.5-27b"
    | "qwen/qwen3.5-2b"
    | "qwen/qwen3.5-35b-a3b"
    | "qwen/qwen3.5-397b-a17b"
    | "qwen/qwen3.5-4b"
    | "qwen/qwen3.5-9b"
    | "qwen/qwen3.5-flash"
    | "qwen/qwen3.5-plus"
    | "qwen/qwq-32b"
    | "qwen/qwq-32b-preview"
    | "qwen/worldpm-72b"
    | "qwen/worldpm-72b-helpsteer2"
    | "qwen/worldpm-72b-rlhflow"
    | "qwen/worldpm-72b-ultrafeedback"
    | "relace/relace-search"
    | "sourceful/riverflow-v2-fast-preview"
    | "sourceful/riverflow-v2-max-preview"
    | "sourceful/riverflow-v2-standard-preview"
    | "stepfun/step-3.5-flash"
    | "suno/suno-v3.5"
    | "suno/suno-v4"
    | "suno/suno-v4.5"
    | "suno/suno-v4.5-"
    | "suno/suno-v4.5-all"
    | "suno/suno-v5"
    | "upstage/solar-pro"
    | "upstage/solar-pro-2"
    | "upstage/solar-pro-2-2025-07-10"
    | "upstage/solar-pro-2-2025-09-09"
    | "upstage/solar-pro-2-preview"
    | "upstage/solar-pro-3"
    | "vercel/v0-1.0-md"
    | "vercel/v0-1.5-lg"
    | "vercel/v0-1.5-md"
    | "vercel/v0-1.5-sm"
    | "x-ai/grok-0"
    | "x-ai/grok-1"
    | "x-ai/grok-1.5"
    | "x-ai/grok-1.5v"
    | "x-ai/grok-2"
    | "x-ai/grok-2-image-1212"
    | "x-ai/grok-2-mini"
    | "x-ai/grok-2-vision-1212"
    | "x-ai/grok-3"
    | "x-ai/grok-3-beta"
    | "x-ai/grok-3-mini"
    | "x-ai/grok-3-mini-beta"
    | "x-ai/grok-4"
    | "x-ai/grok-4-fast-non-reasoning"
    | "x-ai/grok-4-fast-reasoning"
    | "x-ai/grok-4-heavy"
    | "x-ai/grok-4.1-non-thinking"
    | "x-ai/grok-4.1-thinking"
    | "x-ai/grok-4.20"
    | "x-ai/grok-4.20-multi-agent-beta"
    | "x-ai/grok-code-fast-1"
    | "x-ai/grok-imagine-image"
    | "x-ai/grok-imagine-image-pro"
    | "x-ai/grok-imagine-video"
    | "xiaomi/mimo-v2-flash"
    | "xiaomi/mimo-v2-omni"
    | "xiaomi/mimo-v2-pro"
    | "xiaomi/mimo-v2-tts"
    | "z-ai/glm-4-32b"
    | "z-ai/glm-4-9b"
    | "z-ai/glm-4-9b-2024-06-04"
    | "z-ai/glm-4-9b-chat"
    | "z-ai/glm-4-9b-chat-1m"
    | "z-ai/glm-4.1v-9b"
    | "z-ai/glm-4.1v-thinking-9b"
    | "z-ai/glm-4.5"
    | "z-ai/glm-4.5-air"
    | "z-ai/glm-4.5-air-x"
    | "z-ai/glm-4.5-x"
    | "z-ai/glm-4.5v"
    | "z-ai/glm-4.6"
    | "z-ai/glm-4.6v"
    | "z-ai/glm-4.6v-flash"
    | "z-ai/glm-4.7"
    | "z-ai/glm-4.7-flash"
    | "z-ai/glm-4v-9b"
    | "z-ai/glm-5"
    | "z-ai/glm-5-code"
    | "z-ai/glm-5-turbo"
    | "z-ai/glm-5.1"
    | "z-ai/glm-5v-turbo"
    | "z-ai/glm-image"[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/endpoints";
  return client.request<{
    endpoints?: string[];
    ok?: boolean;
    sample_models?:
      | "ai21/jamba-2-3b"
      | "ai21/jamba-large-1.5"
      | "ai21/jamba-large-1.6"
      | "ai21/jamba-large-1.7"
      | "ai21/jamba-mini-1.5"
      | "ai21/jamba-mini-1.6"
      | "ai21/jamba-mini-1.7"
      | "ai21/jamba-mini-2"
      | "ai21/jamba-reasoning-3b"
      | "aion-labs/aion-1.0"
      | "aion-labs/aion-1.0-mini"
      | "aion-labs/aion-2.0"
      | "aion-labs/aion-2.5"
      | "aion-labs/aion-rp-llama-3.1-8b"
      | "allenai/bolmo-1b"
      | "allenai/bolmo-7b"
      | "allenai/molmo-2-4b"
      | "allenai/molmo-2-8b"
      | "allenai/olmo-3-32b-think"
      | "allenai/olmo-3-7b-instruct"
      | "allenai/olmo-3-7b-think"
      | "allenai/olmo-3.1-32b-instruct"
      | "allenai/olmo-3.1-32b-think"
      | "amazon/nova-2-lite"
      | "amazon/nova-2-omni"
      | "amazon/nova-2-pro"
      | "amazon/nova-2-sonic"
      | "amazon/nova-canvas"
      | "amazon/nova-lite-1.0"
      | "amazon/nova-micro-1.0"
      | "amazon/nova-multimodal-embeddings"
      | "amazon/nova-premier"
      | "amazon/nova-pro-1.0"
      | "amazon/nova-reel"
      | "amazon/nova-sonic"
      | "anthropic/claude-1.0"
      | "anthropic/claude-1.1"
      | "anthropic/claude-1.2"
      | "anthropic/claude-1.3"
      | "anthropic/claude-2.0"
      | "anthropic/claude-2.1"
      | "anthropic/claude-3-haiku"
      | "anthropic/claude-3-opus"
      | "anthropic/claude-3-sonnet"
      | "anthropic/claude-3.5-haiku"
      | "anthropic/claude-3.5-sonnet-2024-06-20"
      | "anthropic/claude-3.5-sonnet-2024-10-22"
      | "anthropic/claude-3.7-sonnet"
      | "anthropic/claude-haiku-4.5"
      | "anthropic/claude-instant-1.0"
      | "anthropic/claude-instant-1.1"
      | "anthropic/claude-instant-1.2"
      | "anthropic/claude-opus-4"
      | "anthropic/claude-opus-4.1"
      | "anthropic/claude-opus-4.5"
      | "anthropic/claude-opus-4.6"
      | "anthropic/claude-sonnet-4"
      | "anthropic/claude-sonnet-4.5"
      | "anthropic/claude-sonnet-4.6"
      | "arcee-ai/trinity-large"
      | "arcee-ai/trinity-large-thinking"
      | "arcee-ai/trinity-mini"
      | "arcee-ai/trinity-nano-preview"
      | "baidu/ernie-4.5-21b-a3b"
      | "baidu/ernie-4.5-21b-a3b-thinking"
      | "baidu/ernie-4.5-300b-a47b"
      | "baidu/ernie-4.5-turbo"
      | "baidu/ernie-4.5-vl-28b-a3b"
      | "baidu/ernie-4.5-vl-424b-a47b"
      | "baidu/ernie-5.0"
      | "baidu/ernie-5.0-0110"
      | "baidu/ernie-5.0-preview-1203"
      | "baidu/ernie-5.0-preview-1220"
      | "baidu/ernie-x1.1"
      | "baidu/qianfan-vl-3b"
      | "baidu/qianfan-vl-70b"
      | "baidu/qianfan-vl-8b"
      | "black-forest-labs/flux-2-dev"
      | "black-forest-labs/flux-2-flex"
      | "black-forest-labs/flux-2-klein-4b"
      | "black-forest-labs/flux-2-klein-9b"
      | "black-forest-labs/flux-2-max"
      | "black-forest-labs/flux-2-pro"
      | "bytedance/seed-1.6-2025-06-15"
      | "bytedance/seed-1.6-2025-09-15"
      | "bytedance/seed-1.6-flash-2025-06-15"
      | "bytedance/seed-1.6-flash-2025-07-15"
      | "bytedance/seed-1.8"
      | "bytedance/seed-2.0-lite"
      | "bytedance/seed-2.0-mini"
      | "bytedance/seed-2.0-pro"
      | "bytedance/seed-coder-8b-instruct"
      | "bytedance/seed-coder-8b-reasoning"
      | "bytedance/seed-oss-36b-instruct"
      | "bytedance/seed-translation"
      | "bytedance/seedream-4.5"
      | "cohere/c4ai-aya-expanse-32b"
      | "cohere/c4ai-aya-expanse-8b"
      | "cohere/c4ai-aya-vision-32b"
      | "cohere/c4ai-aya-vision-8b"
      | "cohere/command"
      | "cohere/command-a"
      | "cohere/command-a-reasoning"
      | "cohere/command-a-translate"
      | "cohere/command-a-vision"
      | "cohere/command-light"
      | "cohere/command-r--2024-04-04"
      | "cohere/command-r--2024-08-30"
      | "cohere/command-r-2024-03-11"
      | "cohere/command-r-2024-08-30"
      | "cohere/command-r-7b"
      | "cohere/embed-english-light-v2.0"
      | "cohere/embed-english-light-v3"
      | "cohere/embed-english-v2.0"
      | "cohere/embed-english-v3"
      | "cohere/embed-multilingual-light-v3"
      | "cohere/embed-multilingual-v2.0"
      | "cohere/embed-multilingual-v3"
      | "cohere/embed-v4"
      | "cohere/rerank-multilingual-v3"
      | "cohere/rerank-v3.5"
      | "cohere/rerank-v4.0-fast"
      | "cohere/rerank-v4.0-pro"
      | "cohere/rerenk-english-v3"
      | "cursor/composer-1"
      | "cursor/composer-1.5"
      | "deepseek/deepseek-coder-v2-2024-06-14"
      | "deepseek/deepseek-coder-v2-2024-07-27"
      | "deepseek/deepseek-ocr"
      | "deepseek/deepseek-ocr-2"
      | "deepseek/deepseek-r1-2025-01-20"
      | "deepseek/deepseek-r1-2025-05-28"
      | "deepseek/deepseek-r1-lite-preview"
      | "deepseek/deepseek-v2-2024-05-17"
      | "deepseek/deepseek-v2-2024-06-28"
      | "deepseek/deepseek-v2.5-2024-09-05"
      | "deepseek/deepseek-v2.5-2024-12-10"
      | "deepseek/deepseek-v3-2024-12-26"
      | "deepseek/deepseek-v3-2025-03-24"
      | "deepseek/deepseek-v3.1"
      | "deepseek/deepseek-v3.1-terminus"
      | "deepseek/deepseek-v3.2"
      | "deepseek/deepseek-v3.2-exp"
      | "deepseek/deepseek-v3.2-speciale"
      | "deepseek/deepseek-v4"
      | "deepseek/deepseek-vl2"
      | "deepseek/deepseek-vl2-small"
      | "deepseek/deepseek-vl2-tiny"
      | "eleven-labs/eleven-english-sts-v2"
      | "eleven-labs/eleven-flash-v2"
      | "eleven-labs/eleven-flash-v2.5"
      | "eleven-labs/eleven-monolingual-v1"
      | "eleven-labs/eleven-multilingual-sts-v2"
      | "eleven-labs/eleven-multilingual-ttv-v2"
      | "eleven-labs/eleven-multilingual-v1"
      | "eleven-labs/eleven-multilingual-v2"
      | "eleven-labs/eleven-ttv-v3"
      | "eleven-labs/eleven-turbo-v2"
      | "eleven-labs/eleven-turbo-v2.5"
      | "eleven-labs/eleven-v3"
      | "eleven-labs/scribe-v1"
      | "eleven-labs/scribe-v2"
      | "eleven-labs/scribe-v2-realtime"
      | "essential-ai/rnj-1"
      | "google/chat-bison"
      | "google/code-gecko"
      | "google/embedding-001"
      | "google/gemini-1.0-nano"
      | "google/gemini-1.0-pro"
      | "google/gemini-1.0-pro-vision-001"
      | "google/gemini-1.0-ultra"
      | "google/gemini-1.5-flash-001"
      | "google/gemini-1.5-flash-002"
      | "google/gemini-1.5-flash-8b"
      | "google/gemini-1.5-flash-8b-exp-2024-08-27"
      | "google/gemini-1.5-flash-8b-exp-2024-09-24"
      | "google/gemini-1.5-flash-preview-2024-05-14"
      | "google/gemini-1.5-pro-001"
      | "google/gemini-1.5-pro-002"
      | "google/gemini-1.5-pro-exp-2024-08-01"
      | "google/gemini-1.5-pro-exp-2024-08-27"
      | "google/gemini-2.0-flash"
      | "google/gemini-2.0-flash-exp"
      | "google/gemini-2.0-flash-exp-image-generation"
      | "google/gemini-2.0-flash-lite"
      | "google/gemini-2.0-flash-live-001"
      | "google/gemini-2.0-flash-preview-image-generation"
      | "google/gemini-2.0-flash-thinking-exp-2024-12-19"
      | "google/gemini-2.0-flash-thinking-exp-2025-01-21"
      | "google/gemini-2.0-pro-exp"
      | "google/gemini-2.5-computer-use-preview"
      | "google/gemini-2.5-flash-exp-native-audio-thinking-dialog"
      | "google/gemini-2.5-flash-image"
      | "google/gemini-2.5-flash-image-preview"
      | "google/gemini-2.5-flash-lite-preview-2025-06-17"
      | "google/gemini-2.5-flash-lite-preview-2025-09-25"
      | "google/gemini-2.5-flash-native-audio-preview-2025-09-03"
      | "google/gemini-2.5-flash-preview-2025-04-17"
      | "google/gemini-2.5-flash-preview-2025-05-20"
      | "google/gemini-2.5-flash-preview-2025-09-25"
      | "google/gemini-2.5-flash-preview-native-audio-dialog"
      | "google/gemini-2.5-flash-preview-tts-2025-05-20"
      | "google/gemini-2.5-flash-preview-tts-2025-12-10"
      | "google/gemini-2.5-pro-experimental-2025-03-25"
      | "google/gemini-2.5-pro-preview-2025-05-06"
      | "google/gemini-2.5-pro-preview-2025-06-05"
      | "google/gemini-2.5-pro-preview-tts"
      | "google/gemini-2.5-pro-preview-tts-2025-05-20"
      | "google/gemini-3-flash-preview"
      | "google/gemini-3-pro-image-preview"
      | "google/gemini-3-pro-preview"
      | "google/gemini-3.1-flash-image-preview"
      | "google/gemini-3.1-flash-lite-preview"
      | "google/gemini-3.1-pro-preview"
      | "google/gemini-3.1-pro-preview-customtools"
      | "google/gemini-diffusion"
      | "google/gemini-embedding-001"
      | "google/gemini-embedding-2-preview"
      | "google/gemini-embedding-exp-0307"
      | "google/gemini-exp-1114"
      | "google/gemini-exp-1121"
      | "google/gemini-exp-1206"
      | "google/gemini-live-2.5-flash-preview"
      | "google/gemini-robotics-er-1.5-preview"
      | "google/gemma-1-2b"
      | "google/gemma-1-7b"
      | "google/gemma-2-27b"
      | "google/gemma-2-2b"
      | "google/gemma-2-9b"
      | "google/gemma-3-12b"
      | "google/gemma-3-1b"
      | "google/gemma-3-27b"
      | "google/gemma-3-4b"
      | "google/gemma-3n-e2b"
      | "google/gemma-3n-e4b"
      | "google/image-generation-002"
      | "google/image-generation-005"
      | "google/image-generation-006"
      | "google/image-text"
      | "google/imagen-3.0-generate-001"
      | "google/imagen-3.0-generate-002"
      | "google/imagen-4.0-fast-generate-001"
      | "google/imagen-4.0-fast-generate-preview"
      | "google/imagen-4.0-generate-001"
      | "google/imagen-4.0-generate-preview"
      | "google/imagen-4.0-preview"
      | "google/imagen-4.0-ultra-generate-001"
      | "google/imagen-4.0-ultra-generate-preview"
      | "google/imagen-4.0-ultra-preview"
      | "google/learnlm-1.5-pro-experimental"
      | "google/learnlm-2.0-flash-experimental"
      | "google/lyria-1"
      | "google/lyria-2"
      | "google/lyria-3"
      | "google/medgemma-1.5-4b"
      | "google/multimodal-embedding-001"
      | "google/text-bison"
      | "google/text-embedding-004"
      | "google/text-embedding-005"
      | "google/text-embedding-gecko-001"
      | "google/text-embedding-gecko-002"
      | "google/text-embedding-gecko-003"
      | "google/text-embedding-gecko-multilingual-001"
      | "google/text-multilingual-embedding-002"
      | "google/translategemma-12b"
      | "google/translategemma-27b"
      | "google/translategemma-4b"
      | "google/veo-2"
      | "google/veo-3"
      | "google/veo-3-fast"
      | "google/veo-3.0-fast-generate-preview"
      | "google/veo-3.0-generate-preview"
      | "google/veo-3.1-fast-preview"
      | "google/veo-3.1-lite-preview"
      | "google/veo-3.1-preview"
      | "google/veo-3.2"
      | "google/veo-4"
      | "ibm/granite-20b-code-instruct-8k"
      | "ibm/granite-3.0-1b-a400m-instruct"
      | "ibm/granite-3.0-2b-instruct"
      | "ibm/granite-3.0-3b-a800m-instruct"
      | "ibm/granite-3.0-8b-instruct"
      | "ibm/granite-3.1-1b-a400m-instruct"
      | "ibm/granite-3.1-2b-instruct"
      | "ibm/granite-3.1-3b-a800m-instruct"
      | "ibm/granite-3.1-8b-instruct"
      | "ibm/granite-3.2-2b-instruct"
      | "ibm/granite-3.2-8b-instruct"
      | "ibm/granite-3.2-8b-instruct-preview"
      | "ibm/granite-3.3-2b-instruct"
      | "ibm/granite-3.3-8b-instruct"
      | "ibm/granite-34b-code-instruct-8b"
      | "ibm/granite-3b-code-instruct-128k"
      | "ibm/granite-3b-code-instruct-2k"
      | "ibm/granite-4.0-micro"
      | "ibm/granite-4.0-small"
      | "ibm/granite-4.0-tiny"
      | "ibm/granite-4.0-tiny-preview"
      | "ibm/granite-8b-code-instruct-128k"
      | "ibm/granite-8b-code-instruct-4k"
      | "ibm/granite-embedding-107m-multilingual"
      | "ibm/granite-embedding-125m-english"
      | "ibm/granite-embedding-278m-multilingual"
      | "ibm/granite-embedding-30m-english"
      | "ibm/granite-embedding-english-r2"
      | "ibm/granite-embedding-reranker-english-r2"
      | "ibm/granite-embedding-small-english-r2"
      | "ibm/granite-guardian-3.0-2b"
      | "ibm/granite-guardian-3.0-8b"
      | "ibm/granite-guardian-3.1-2b"
      | "ibm/granite-guardian-3.1-8b"
      | "ibm/granite-guardian-3.2-5b"
      | "ibm/granite-guardian-3.3-8b"
      | "ibm/granite-speech-3.2-8b"
      | "ibm/granite-speech-3.3-2b"
      | "ibm/granite-speech-3.3-8b"
      | "ibm/granite-vision-3.1-2b-preview"
      | "ibm/granite-vision-3.2-2b"
      | "ibm/granite-vision-3.3-2b"
      | "ibm/granite-vision-3.3-2b-embedding"
      | "inception/mercury-2"
      | "inclusionai/ring-1t-2.5"
      | "kwaipilot/kat-coder-exp-72b-1010"
      | "kwaipilot/kat-coder-pro"
      | "kwaipilot/kat-coder-pro-v2"
      | "lg/exaone-3.0"
      | "lg/exaone-3.5-2.4b"
      | "lg/exaone-3.5-32b"
      | "lg/exaone-3.5-7.8b"
      | "lg/exaone-4.0-1.2b"
      | "lg/exaone-4.0-32b"
      | "lg/exaone-deep-2.4b"
      | "lg/exaone-deep-32b"
      | "lg/exaone-deep-7.8b"
      | "lg/k-exaone"
      | "liquid-ai/lfm-2-1.2b"
      | "liquid-ai/lfm-2-2.6b"
      | "liquid-ai/lfm-2-24b-a2b"
      | "liquid-ai/lfm-2-350m"
      | "liquid-ai/lfm-2-700m"
      | "liquid-ai/lfm-2-8b-a1b"
      | "liquid-ai/lfm-2.5-1.2b"
      | "liquid-ai/lfm-2.5-1.2b-jp"
      | "liquid-ai/lfm-2.5-1.2b-thinking"
      | "liquid-ai/lfm-2.5-audio-1.5b"
      | "liquid-ai/lfm-2.5-vl-1.6b"
      | "meituan/longcat-flash-cat"
      | "meta/llama-2-13b-chat"
      | "meta/llama-2-70b-chat"
      | "meta/llama-2-7b-chat"
      | "meta/llama-3-70b"
      | "meta/llama-3-8b"
      | "meta/llama-3.1-405b"
      | "meta/llama-3.1-70b"
      | "meta/llama-3.1-8b"
      | "meta/llama-3.2-11b-vision"
      | "meta/llama-3.2-1b"
      | "meta/llama-3.2-3b"
      | "meta/llama-3.2-90b-vision"
      | "meta/llama-3.3-70b"
      | "meta/llama-4-maverick"
      | "meta/llama-4-scout"
      | "microsoft/phi-1"
      | "microsoft/phi-1.5"
      | "microsoft/phi-2"
      | "microsoft/phi-3-medium-128k-instruct"
      | "microsoft/phi-3-medium-4k-instruct"
      | "microsoft/phi-3-mini-128k-instruct"
      | "microsoft/phi-3-small-128k-instruct"
      | "microsoft/phi-3-small-8k-instruct"
      | "microsoft/phi-3-vision-128k-instruct"
      | "microsoft/phi-3.5-mini-instruct"
      | "microsoft/phi-3.5-moe-instruct"
      | "microsoft/phi-3.5-vision-instruct"
      | "microsoft/phi-4"
      | "microsoft/phi-4-mini"
      | "microsoft/phi-4-mini-flash-reasoning"
      | "microsoft/phi-4-mini-reasoning"
      | "microsoft/phi-4-multimodal-instruct"
      | "microsoft/phi-4-reasoning"
      | "microsoft/phi-4-reasoning-plus"
      | "minimax/hailuo-02"
      | "minimax/hailuo-2.3"
      | "minimax/hailuo-2.3-fast"
      | "minimax/i2v-01-director"
      | "minimax/i2v-01-live"
      | "minimax/image-01"
      | "minimax/minimax-m1-40k"
      | "minimax/minimax-m1-80k"
      | "minimax/minimax-m2"
      | "minimax/minimax-m2-her"
      | "minimax/minimax-m2.1"
      | "minimax/minimax-m2.5"
      | "minimax/minimax-m2.7"
      | "minimax/minimax-text-01"
      | "minimax/minimax-vl-01"
      | "minimax/music-1.5"
      | "minimax/music-2.0"
      | "minimax/music-2.5"
      | "minimax/s2v-01"
      | "minimax/speech-01-hd"
      | "minimax/speech-01-turbo"
      | "minimax/speech-02-hd"
      | "minimax/speech-02-turbo"
      | "minimax/speech-2.5-hd-preview"
      | "minimax/speech-2.5-turbo-preview"
      | "minimax/speech-2.6"
      | "minimax/t2v-01-director"
      | "mistral/codestral"
      | "mistral/codestral-2024-05-29"
      | "mistral/codestral-2025-01-13"
      | "mistral/codestral-embed"
      | "mistral/codestral-mamba-7b"
      | "mistral/devstral-2.0"
      | "mistral/devstral-medium-1.0"
      | "mistral/devstral-small-1.0"
      | "mistral/devstral-small-1.1"
      | "mistral/devstral-small-2.0"
      | "mistral/leanstral"
      | "mistral/magistral-medium-1.0"
      | "mistral/magistral-medium-1.1"
      | "mistral/magistral-medium-1.2"
      | "mistral/magistral-small-1.0"
      | "mistral/magistral-small-1.1"
      | "mistral/magistral-small-1.2"
      | "mistral/mathstral-7b"
      | "mistral/ministral-3.0-14b"
      | "mistral/ministral-3.0-3b"
      | "mistral/ministral-3.0-8b"
      | "mistral/ministral-3b"
      | "mistral/ministral-8b"
      | "mistral/mistral-7b"
      | "mistral/mistral-7b-2023-09-27"
      | "mistral/mistral-7b-2023-12-11"
      | "mistral/mistral-embed"
      | "mistral/mistral-large-1.0"
      | "mistral/mistral-large-2.0"
      | "mistral/mistral-large-2.1"
      | "mistral/mistral-large-3.0"
      | "mistral/mistral-medium-1.0"
      | "mistral/mistral-medium-3.0"
      | "mistral/mistral-medium-3.1"
      | "mistral/mistral-moderation"
      | "mistral/mistral-moderation-2"
      | "mistral/mistral-nemo-12b"
      | "mistral/mistral-ocr"
      | "mistral/mistral-ocr-2"
      | "mistral/mistral-saba"
      | "mistral/mistral-small-1.0"
      | "mistral/mistral-small-2.0"
      | "mistral/mistral-small-3.0"
      | "mistral/mistral-small-3.1"
      | "mistral/mistral-small-3.2"
      | "mistral/mistral-small-4"
      | "mistral/mistral-small-creative"
      | "mistral/mixtral-8x22b"
      | "mistral/mixtral-8x7b"
      | "mistral/ocr-3"
      | "mistral/pixtral-12b"
      | "mistral/pixtral-large"
      | "mistral/voxtral-mini"
      | "mistral/voxtral-mini-transcribe"
      | "mistral/voxtral-mini-transcribe-2"
      | "mistral/voxtral-small"
      | "moonshotai/kimi-k1.5"
      | "moonshotai/kimi-k2"
      | "moonshotai/kimi-k2-2025-07-11"
      | "moonshotai/kimi-k2-thinking"
      | "moonshotai/kimi-k2.5"
      | "moonshotai/kimi-linear-48b"
      | "moonshotai/kimi-vl-a3b"
      | "moonshotai/kimi-vl-a3b-thinking"
      | "moonshotai/kimi-vl-a3b-thinking-2025-04-09"
      | "naver-hyperclova/hyperclova-x-seed-omni-8b"
      | "naver-hyperclova/hyperclova-x-seed-think-14b"
      | "naver-hyperclova/hyperclova-x-seed-think-32b"
      | "nous/hermes-2-llama-2-70b"
      | "nous/hermes-2-pro-llama-3-70b"
      | "nous/hermes-2-pro-llama-3-8b"
      | "nous/hermes-2-pro-mistral-7b"
      | "nous/hermes-2-theta-llama-3-70b"
      | "nous/hermes-2-theta-llama-3-8b"
      | "nous/hermes-3-llama-3.1-405b"
      | "nous/hermes-3-llama-3.1-70b"
      | "nous/hermes-3-llama-3.1-8b"
      | "nous/hermes-3-llama-3.2-3b"
      | "nous/hermes-4-14b"
      | "nous/hermes-4-405b"
      | "nous/hermes-4-70b"
      | "nous/hermes-4.3-36b"
      | "nous/nomos-1"
      | "nous/nouscoder-14b"
      | "nvidia/llama-3.1-nemotron-70b-instruct"
      | "nvidia/llama-3.1-nemotron-nano-4b-v1.1"
      | "nvidia/llama-3.1-nemotron-nano-8b-v1"
      | "nvidia/llama-3.1-nemotron-ultra-253b-v1"
      | "nvidia/llama-3.3-nemotron-super-49b-v1"
      | "nvidia/llama-3.3-nemotron-super-49b-v1.5"
      | "nvidia/nemotron-3-nano-30b-a3b"
      | "nvidia/nemotron-3-super-120b-a12b"
      | "nvidia/nvidia-nemotron-nano-12b-v2"
      | "nvidia/nvidia-nemotron-nano-9b-v2"
      | "nvidia/openreasoning-nemotron-1.5b"
      | "nvidia/openreasoning-nemotron-14b"
      | "nvidia/openreasoning-nemotron-32b"
      | "nvidia/openreasoning-nemotron-7b"
      | "openai/ada"
      | "openai/babbage"
      | "openai/babbage-002"
      | "openai/chatgpt-4o"
      | "openai/chatgpt-image-latest"
      | "openai/code-cushman-001"
      | "openai/code-cushman-002"
      | "openai/code-davinci-001"
      | "openai/code-davinci-002"
      | "openai/code-davinci-edit-001"
      | "openai/code-search-ada-code-001"
      | "openai/code-search-ada-text-001"
      | "openai/code-search-babbage-code-001"
      | "openai/code-search-babbage-text-001"
      | "openai/codex-mini"
      | "openai/computer-use-preview"
      | "openai/curie"
      | "openai/dall-e"
      | "openai/dall-e-2"
      | "openai/dall-e-3"
      | "openai/davinci"
      | "openai/davinci-002"
      | "openai/gpt-1"
      | "openai/gpt-2"
      | "openai/gpt-3"
      | "openai/gpt-3.5-turbo-0613"
      | "openai/gpt-3.5-turbo-16k-0613"
      | "openai/gpt-3.5-turbo-2023-11-06"
      | "openai/gpt-3.5-turbo-2024-01-25"
      | "openai/gpt-3.5-turbo-instruct"
      | "openai/gpt-4"
      | "openai/gpt-4-2023-03-14"
      | "openai/gpt-4-32k"
      | "openai/gpt-4-32k-0314"
      | "openai/gpt-4-32k-0613"
      | "openai/gpt-4-turbo"
      | "openai/gpt-4-turbo-2023-03-14"
      | "openai/gpt-4-turbo-2023-11-06"
      | "openai/gpt-4.1"
      | "openai/gpt-4.1-mini"
      | "openai/gpt-4.1-nano"
      | "openai/gpt-4.5"
      | "openai/gpt-4o"
      | "openai/gpt-4o-2024-05-13"
      | "openai/gpt-4o-2024-08-06"
      | "openai/gpt-4o-audio"
      | "openai/gpt-4o-audio-2024-10-01"
      | "openai/gpt-4o-audio-2024-12-17"
      | "openai/gpt-4o-mini"
      | "openai/gpt-4o-mini-audio-preview"
      | "openai/gpt-4o-mini-realtime-preview"
      | "openai/gpt-4o-mini-search-preview"
      | "openai/gpt-4o-mini-transcribe"
      | "openai/gpt-4o-mini-transcribe-2025-03-20"
      | "openai/gpt-4o-mini-tts"
      | "openai/gpt-4o-mini-tts-2025-03-20"
      | "openai/gpt-4o-realtime-preview"
      | "openai/gpt-4o-realtime-preview-2024-10-01"
      | "openai/gpt-4o-realtime-preview-2024-12-17"
      | "openai/gpt-4o-search-preview"
      | "openai/gpt-4o-transcribe"
      | "openai/gpt-4o-transcribe-diarize"
      | "openai/gpt-5"
      | "openai/gpt-5-chat"
      | "openai/gpt-5-codex"
      | "openai/gpt-5-codex-mini"
      | "openai/gpt-5-mini"
      | "openai/gpt-5-nano"
      | "openai/gpt-5-pro"
      | "openai/gpt-5-search-api"
      | "openai/gpt-5.1"
      | "openai/gpt-5.1-chat"
      | "openai/gpt-5.1-codex"
      | "openai/gpt-5.1-codex-max"
      | "openai/gpt-5.1-codex-mini"
      | "openai/gpt-5.1-pro"
      | "openai/gpt-5.2"
      | "openai/gpt-5.2-chat"
      | "openai/gpt-5.2-codex"
      | "openai/gpt-5.2-mini"
      | "openai/gpt-5.2-pro"
      | "openai/gpt-5.3-chat"
      | "openai/gpt-5.3-codex"
      | "openai/gpt-5.3-codex-spark"
      | "openai/gpt-5.4"
      | "openai/gpt-5.4-mini"
      | "openai/gpt-5.4-nano"
      | "openai/gpt-5.4-pro"
      | "openai/gpt-audio"
      | "openai/gpt-audio-1.5"
      | "openai/gpt-audio-mini"
      | "openai/gpt-audio-mini-2025-10-06"
      | "openai/gpt-image-1"
      | "openai/gpt-image-1-mini"
      | "openai/gpt-image-1.5"
      | "openai/gpt-oss-120b"
      | "openai/gpt-oss-20b"
      | "openai/gpt-oss-safeguard-120b"
      | "openai/gpt-oss-safeguard-20b"
      | "openai/gpt-realtime"
      | "openai/gpt-realtime-1.5"
      | "openai/gpt-realtime-mini"
      | "openai/gpt-realtime-mini-2025-10-06"
      | "openai/o1"
      | "openai/o1-mini"
      | "openai/o1-preview"
      | "openai/o1-pro"
      | "openai/o3"
      | "openai/o3-deep-research"
      | "openai/o3-mini"
      | "openai/o3-preview"
      | "openai/o3-pro"
      | "openai/o4-mini"
      | "openai/o4-mini-deep-research"
      | "openai/omni-moderation"
      | "openai/sora-1"
      | "openai/sora-2"
      | "openai/sora-2-2025-09-30"
      | "openai/sora-2-pro"
      | "openai/text-ada-001"
      | "openai/text-babbage-001"
      | "openai/text-curie-001"
      | "openai/text-davinci-001"
      | "openai/text-davinci-002"
      | "openai/text-davinci-003"
      | "openai/text-davinci-edit-001"
      | "openai/text-embedding-3-large"
      | "openai/text-embedding-3-small"
      | "openai/text-embedding-ada-002"
      | "openai/text-moderation-007"
      | "openai/text-search-ada-doc-001"
      | "openai/text-search-ada-query-001"
      | "openai/text-search-babbage-doc-001"
      | "openai/text-search-babbage-query-001"
      | "openai/text-search-curie-doc-001"
      | "openai/text-search-curie-query-001"
      | "openai/text-search-davinci-doc-001"
      | "openai/text-search-davinci-query-001"
      | "openai/text-similarity-ada-001"
      | "openai/text-similarity-babbage-001"
      | "openai/text-similarity-curie-001"
      | "openai/text-similarity-davinci-001"
      | "openai/tts-1"
      | "openai/tts-1-hd"
      | "openai/whisper-1"
      | "openai/whisper-3"
      | "openai/whisper-3-turbo"
      | "prime-intellect/intellect-3"
      | "prime-intellect/intellect-3.1"
      | "qwen/code-qwen-1.5-7b"
      | "qwen/qvq-72b-preview"
      | "qwen/qwen-1.8b"
      | "qwen/qwen-14b"
      | "qwen/qwen-72b"
      | "qwen/qwen-7b"
      | "qwen/qwen-audio"
      | "qwen/qwen-audio-chat"
      | "qwen/qwen-image"
      | "qwen/qwen-image-2512"
      | "qwen/qwen-image-edit"
      | "qwen/qwen-image-edit-2509"
      | "qwen/qwen-image-edit-2511"
      | "qwen/qwen-image-layered"
      | "qwen/qwen-vl"
      | "qwen/qwen1.5-0.5b"
      | "qwen/qwen1.5-1.8b"
      | "qwen/qwen1.5-110b"
      | "qwen/qwen1.5-14b"
      | "qwen/qwen1.5-32b"
      | "qwen/qwen1.5-4b"
      | "qwen/qwen1.5-72b"
      | "qwen/qwen1.5-7b"
      | "qwen/qwen1.5-moe-a2.7b"
      | "qwen/qwen2-0.5b"
      | "qwen/qwen2-1.5b"
      | "qwen/qwen2-72b"
      | "qwen/qwen2-7b"
      | "qwen/qwen2-audio-7b"
      | "qwen/qwen2-math-1.5b"
      | "qwen/qwen2-math-72b"
      | "qwen/qwen2-math-7b"
      | "qwen/qwen2-math-rm-72b"
      | "qwen/qwen2-vl-2b"
      | "qwen/qwen2-vl-72b"
      | "qwen/qwen2-vl-7b"
      | "qwen/qwen2.5-0.5b"
      | "qwen/qwen2.5-1.5b"
      | "qwen/qwen2.5-14b"
      | "qwen/qwen2.5-32b"
      | "qwen/qwen2.5-3b"
      | "qwen/qwen2.5-72b"
      | "qwen/qwen2.5-7b"
      | "qwen/qwen2.5-coder-0.5b"
      | "qwen/qwen2.5-coder-1.5b"
      | "qwen/qwen2.5-coder-14b"
      | "qwen/qwen2.5-coder-32b"
      | "qwen/qwen2.5-coder-3b"
      | "qwen/qwen2.5-coder-7b"
      | "qwen/qwen2.5-math-1.5b"
      | "qwen/qwen2.5-math-72b"
      | "qwen/qwen2.5-math-7b"
      | "qwen/qwen2.5-math-7b-prm800k"
      | "qwen/qwen2.5-math-prm-72b"
      | "qwen/qwen2.5-math-prm-7b"
      | "qwen/qwen2.5-math-rm-72b"
      | "qwen/qwen2.5-omni-3b"
      | "qwen/qwen2.5-omni-7b"
      | "qwen/qwen2.5-vl-32b"
      | "qwen/qwen2.5-vl-3b"
      | "qwen/qwen2.5-vl-72b"
      | "qwen/qwen2.5-vl-7b"
      | "qwen/qwen3-0.6b"
      | "qwen/qwen3-1.7b"
      | "qwen/qwen3-14b"
      | "qwen/qwen3-235b-a22b"
      | "qwen/qwen3-235b-a22b-2507"
      | "qwen/qwen3-235b-a22b-thinking-2507"
      | "qwen/qwen3-30b-a3b"
      | "qwen/qwen3-30b-a3b-instruct-2507"
      | "qwen/qwen3-30b-a3b-thinking-2507"
      | "qwen/qwen3-32b"
      | "qwen/qwen3-4b"
      | "qwen/qwen3-4b-instruct-2507"
      | "qwen/qwen3-4b-saferl"
      | "qwen/qwen3-4b-thinking-2507"
      | "qwen/qwen3-8b"
      | "qwen/qwen3-asr-0.6b"
      | "qwen/qwen3-asr-1.7b"
      | "qwen/qwen3-coder-30b-a3b"
      | "qwen/qwen3-coder-480b-a35b"
      | "qwen/qwen3-coder-next"
      | "qwen/qwen3-embedding-0.6b"
      | "qwen/qwen3-embedding-4b"
      | "qwen/qwen3-embedding-8b"
      | "qwen/qwen3-forcedaligner-0.6b"
      | "qwen/qwen3-guard-gen-0.6b"
      | "qwen/qwen3-guard-gen-4b"
      | "qwen/qwen3-guard-gen-8b"
      | "qwen/qwen3-guard-stream-0.6b"
      | "qwen/qwen3-guard-stream-4b"
      | "qwen/qwen3-guard-stream-8b"
      | "qwen/qwen3-max-thinking"
      | "qwen/qwen3-next-80b-a3b-instruct"
      | "qwen/qwen3-next-80b-a3b-thinking"
      | "qwen/qwen3-omni-30b-a3b-captioner"
      | "qwen/qwen3-omni-30b-a3b-instruct"
      | "qwen/qwen3-omni-30b-a3b-thinking"
      | "qwen/qwen3-omni-flash"
      | "qwen/qwen3-omni-flash-2025-09-15"
      | "qwen/qwen3-reranker-0.6b"
      | "qwen/qwen3-reranker-4b"
      | "qwen/qwen3-reranker-8b"
      | "qwen/qwen3-tts"
      | "qwen/qwen3-tts-12hz-0.6b-base"
      | "qwen/qwen3-tts-12hz-0.6b-customvoice"
      | "qwen/qwen3-tts-12hz-1.7b-base"
      | "qwen/qwen3-tts-12hz-1.7b-voicedesign"
      | "qwen/qwen3-tts-tokenizer-12hz"
      | "qwen/qwen3-vl-235b-a22b-instruct"
      | "qwen/qwen3-vl-235b-a22b-thinking"
      | "qwen/qwen3-vl-2b-instruct"
      | "qwen/qwen3-vl-2b-thinking"
      | "qwen/qwen3-vl-30b-a3b-instruct"
      | "qwen/qwen3-vl-30b-a3b-thinking"
      | "qwen/qwen3-vl-32b-instruct"
      | "qwen/qwen3-vl-32b-thinking"
      | "qwen/qwen3-vl-4b-instruct"
      | "qwen/qwen3-vl-4b-thinking"
      | "qwen/qwen3-vl-8b-instruct"
      | "qwen/qwen3-vl-8b-thinking"
      | "qwen/qwen3-vl-embedding-2b"
      | "qwen/qwen3-vl-embedding-8b"
      | "qwen/qwen3-vl-reranker-2b"
      | "qwen/qwen3-vl-reranker-8b"
      | "qwen/qwen3.5-0.8b"
      | "qwen/qwen3.5-122b-a10b"
      | "qwen/qwen3.5-27b"
      | "qwen/qwen3.5-2b"
      | "qwen/qwen3.5-35b-a3b"
      | "qwen/qwen3.5-397b-a17b"
      | "qwen/qwen3.5-4b"
      | "qwen/qwen3.5-9b"
      | "qwen/qwen3.5-flash"
      | "qwen/qwen3.5-plus"
      | "qwen/qwq-32b"
      | "qwen/qwq-32b-preview"
      | "qwen/worldpm-72b"
      | "qwen/worldpm-72b-helpsteer2"
      | "qwen/worldpm-72b-rlhflow"
      | "qwen/worldpm-72b-ultrafeedback"
      | "relace/relace-search"
      | "sourceful/riverflow-v2-fast-preview"
      | "sourceful/riverflow-v2-max-preview"
      | "sourceful/riverflow-v2-standard-preview"
      | "stepfun/step-3.5-flash"
      | "suno/suno-v3.5"
      | "suno/suno-v4"
      | "suno/suno-v4.5"
      | "suno/suno-v4.5-"
      | "suno/suno-v4.5-all"
      | "suno/suno-v5"
      | "upstage/solar-pro"
      | "upstage/solar-pro-2"
      | "upstage/solar-pro-2-2025-07-10"
      | "upstage/solar-pro-2-2025-09-09"
      | "upstage/solar-pro-2-preview"
      | "upstage/solar-pro-3"
      | "vercel/v0-1.0-md"
      | "vercel/v0-1.5-lg"
      | "vercel/v0-1.5-md"
      | "vercel/v0-1.5-sm"
      | "x-ai/grok-0"
      | "x-ai/grok-1"
      | "x-ai/grok-1.5"
      | "x-ai/grok-1.5v"
      | "x-ai/grok-2"
      | "x-ai/grok-2-image-1212"
      | "x-ai/grok-2-mini"
      | "x-ai/grok-2-vision-1212"
      | "x-ai/grok-3"
      | "x-ai/grok-3-beta"
      | "x-ai/grok-3-mini"
      | "x-ai/grok-3-mini-beta"
      | "x-ai/grok-4"
      | "x-ai/grok-4-fast-non-reasoning"
      | "x-ai/grok-4-fast-reasoning"
      | "x-ai/grok-4-heavy"
      | "x-ai/grok-4.1-non-thinking"
      | "x-ai/grok-4.1-thinking"
      | "x-ai/grok-4.20"
      | "x-ai/grok-4.20-multi-agent-beta"
      | "x-ai/grok-code-fast-1"
      | "x-ai/grok-imagine-image"
      | "x-ai/grok-imagine-image-pro"
      | "x-ai/grok-imagine-video"
      | "xiaomi/mimo-v2-flash"
      | "xiaomi/mimo-v2-omni"
      | "xiaomi/mimo-v2-pro"
      | "xiaomi/mimo-v2-tts"
      | "z-ai/glm-4-32b"
      | "z-ai/glm-4-9b"
      | "z-ai/glm-4-9b-2024-06-04"
      | "z-ai/glm-4-9b-chat"
      | "z-ai/glm-4-9b-chat-1m"
      | "z-ai/glm-4.1v-9b"
      | "z-ai/glm-4.1v-thinking-9b"
      | "z-ai/glm-4.5"
      | "z-ai/glm-4.5-air"
      | "z-ai/glm-4.5-air-x"
      | "z-ai/glm-4.5-x"
      | "z-ai/glm-4.5v"
      | "z-ai/glm-4.6"
      | "z-ai/glm-4.6v"
      | "z-ai/glm-4.6v-flash"
      | "z-ai/glm-4.7"
      | "z-ai/glm-4.7-flash"
      | "z-ai/glm-4v-9b"
      | "z-ai/glm-5"
      | "z-ai/glm-5-code"
      | "z-ai/glm-5-turbo"
      | "z-ai/glm-5.1"
      | "z-ai/glm-5v-turbo"
      | "z-ai/glm-image"[];
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
 * Placeholder endpoint. File listing is not implemented yet.
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

export type ListManagementKeysParams = {
  path?: Record<string, never>;
  query?: {
    limit?: number;
    offset?: number;
    team_id?: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns all management API keys for a team.
 */
export async function listManagementKeys(
  client: Client,
  args: ListManagementKeysParams = {},
): Promise<{
  keys: {
    created_at?: string;
    id?: string;
    last_used_at?: string | null;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
  }[];
  limit: number;
  offset: number;
  ok: true;
  total: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/management/keys";
  return client.request<{
    keys: {
      created_at?: string;
      id?: string;
      last_used_at?: string | null;
      name?: string;
      prefix?: string;
      scopes?: string;
      status?: "active" | "disabled" | "revoked";
    }[];
    limit: number;
    offset: number;
    ok: true;
    total: number;
  }>({
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
    endpoints?: string[];
    feed?: "json" | "rss" | "atom";
    format?: "json" | "rss" | "atom";
    input_types?: string[];
    limit?: number;
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
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
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
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
      | "x-ai"
      | "xiaomi"
      | "z-ai"[];
    output_types?: string[];
    params?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns shared non-hidden models currently servable through the gateway.
 */
export async function listModels(
  client: Client,
  args: ListModelsParams = {},
): Promise<{
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
      api_provider_id?: string;
      is_active_gateway?: boolean;
      params?: string[];
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
        api_provider_id?: string;
        is_active_gateway?: boolean;
        params?: string[];
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

export type ListOAuthClientsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Lists OAuth clients for the authenticated team.
 */
export async function listOAuthClients(
  client: Client,
  args: ListOAuthClientsParams = {},
): Promise<{
  data?: {
    [key: string]: unknown;
  }[];
  pagination?: {
    [key: string]: unknown;
  };
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/oauth-clients";
  return client.request<{
    data?: {
      [key: string]: unknown;
    }[];
    pagination?: {
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
    endpoints?: string[];
    feed?: "json" | "rss" | "atom";
    format?: "json" | "rss" | "atom";
    input_types?: string[];
    limit?: number;
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
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
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
      | "prime-intellect"
      | "qwen"
      | "relace"
      | "sourceful"
      | "stepfun"
      | "suno"
      | "upstage"
      | "vercel"
      | "voyage"
      | "x-ai"
      | "xiaomi"
      | "z-ai"[];
    output_types?: string[];
    params?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns team-scoped gateway model listings.
 */
export async function listTeamModels(
  client: Client,
  args: ListTeamModelsParams = {},
): Promise<{
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
      api_provider_id?: string;
      is_active_gateway?: boolean;
      params?: string[];
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
        api_provider_id?: string;
        is_active_gateway?: boolean;
        params?: string[];
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

export type RegenerateOAuthClientSecretParams = {
  path?: {
    client_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Regenerates and returns a new OAuth client secret.
 */
export async function regenerateOAuthClientSecret(
  client: Client,
  args: RegenerateOAuthClientSecretParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/oauth-clients/${encodeURIComponent(String(path?.client_id))}/regenerate-secret`;
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

export type RetrieveBatchParams = {
  path?: {
    batch_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Placeholder endpoint. Batch retrieval is not implemented yet.
 */
export async function retrieveBatch(
  client: Client,
  args: RetrieveBatchParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/batches/${encodeURIComponent(String(path?.batch_id))}`;
  return client.request<unknown>({
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
 * Alias of /batches/{batch_id}. Currently not implemented.
 */
export async function retrieveBatchAlias(
  client: Client,
  args: RetrieveBatchAliasParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/batch/${encodeURIComponent(String(path?.id))}`;
  return client.request<unknown>({
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
 * Placeholder endpoint. File retrieval is not implemented yet.
 */
export async function retrieveFile(
  client: Client,
  args: RetrieveFileParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/files/${encodeURIComponent(String(path?.file_id))}`;
  return client.request<unknown>({
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
 * Retrieves binary content for a previously uploaded file.
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

export type UpdateManagementKeyParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    name?: string;
    soft_blocked?: boolean;
    status?: "active" | "disabled" | "revoked";
  };
};

/**
 * Updates the name, status, or blocked state of a management API key.
 */
export async function updateManagementKey(
  client: Client,
  args: UpdateManagementKeyParams = {},
): Promise<{
  message: string;
  ok: true;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/management/keys/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    message: string;
    ok: true;
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateOAuthClientParams = {
  path?: {
    client_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    [key: string]: unknown;
  };
};

/**
 * Updates OAuth client metadata and redirect URIs.
 */
export async function updateOAuthClient(
  client: Client,
  args: UpdateOAuthClientParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/oauth-clients/${encodeURIComponent(String(path?.client_id))}`;
  return client.request<{
    [key: string]: unknown;
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
 * Placeholder endpoint. File upload is not implemented yet.
 */
export async function uploadFile(
  client: Client,
  args: UploadFileParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/files";
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

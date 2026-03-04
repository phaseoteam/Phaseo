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
    image_config?: {
      aspect_ratio?: string;
      aspectRatio?: string;
      font_inputs?: {
        font_url?: string;
        text?: string;
      }[];
      fontInputs?: {
        fontUrl?: string;
        text?: string;
      }[];
      image_size?: "0.5K" | "1K" | "2K" | "4K";
      imageSize?: "0.5K" | "1K" | "2K" | "4K";
      include_rai_reason?: boolean;
      includeRaiReason?: boolean;
      reference_images?: {
        [key: string]: unknown;
      }[];
      referenceImages?: {
        [key: string]: unknown;
      }[];
      super_resolution_references?: string[];
      superResolutionReferences?: string[];
      [key: string]: unknown;
    };
    imageConfig?: {
      aspect_ratio?: string;
      aspectRatio?: string;
      font_inputs?: {
        font_url?: string;
        text?: string;
      }[];
      fontInputs?: {
        fontUrl?: string;
        text?: string;
      }[];
      image_size?: "0.5K" | "1K" | "2K" | "4K";
      imageSize?: "0.5K" | "1K" | "2K" | "4K";
      include_rai_reason?: boolean;
      includeRaiReason?: boolean;
      reference_images?: {
        [key: string]: unknown;
      }[];
      referenceImages?: {
        [key: string]: unknown;
      }[];
      super_resolution_references?: string[];
      superResolutionReferences?: string[];
      [key: string]: unknown;
    };
    max_tokens?: number;
    messages: {
      content:
        | string
        | {
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
    metadata?: {
      [key: string]: string;
    };
    modalities?: string[];
    model: string;
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
    };
    response_modalities?: string[];
    responseModalities?: string[];
    stream?: boolean;
    system?: string | {}[];
    temperature?: number;
    thinking?: {
      budget_tokens?: number;
      budgetTokens?: number;
      effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
      enabled?: boolean;
      include_thoughts?: boolean;
      includeThoughts?: boolean;
      max_tokens?: number;
      maxTokens?: number;
      type?: "enabled" | "disabled" | "adaptive";
    };
    tool_choice?: string | {};
    tools?: {
      description?: string;
      input_schema?: {};
      name: string;
    }[];
    top_k?: number;
    top_p?: number;
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

export type CreateAudioRealtimeCallPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /realtime/calls. Currently returns not implemented.
 */
export async function createAudioRealtimeCallPlaceholder(
  client: Client,
  args: CreateAudioRealtimeCallPlaceholderParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/realtime/calls";
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateAudioRealtimeClientSecretsPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /realtime/client_secrets. Currently returns not implemented.
 */
export async function createAudioRealtimeClientSecretsPlaceholder(
  client: Client,
  args: CreateAudioRealtimeClientSecretsPlaceholderParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/realtime/client_secrets";
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateAudioRealtimeSessionPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /realtime. Currently returns not implemented.
 */
export async function createAudioRealtimeSessionPlaceholder(
  client: Client,
  args: CreateAudioRealtimeSessionPlaceholderParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/realtime";
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateAudioRealtimeSessionsPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /realtime/sessions. Currently returns not implemented.
 */
export async function createAudioRealtimeSessionsPlaceholder(
  client: Client,
  args: CreateAudioRealtimeSessionsPlaceholderParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/audio/realtime/sessions";
  return client.request<unknown>({
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
    frequency_penalty?: number;
    image_config?: {
      aspect_ratio?: string;
      aspectRatio?: string;
      font_inputs?: {
        font_url?: string;
        text?: string;
      }[];
      fontInputs?: {
        fontUrl?: string;
        text?: string;
      }[];
      image_size?: "0.5K" | "1K" | "2K" | "4K";
      imageSize?: "0.5K" | "1K" | "2K" | "4K";
      include_rai_reason?: boolean;
      includeRaiReason?: boolean;
      reference_images?: {
        [key: string]: unknown;
      }[];
      referenceImages?: {
        [key: string]: unknown;
      }[];
      super_resolution_references?: string[];
      superResolutionReferences?: string[];
      [key: string]: unknown;
    };
    imageConfig?: {
      aspect_ratio?: string;
      aspectRatio?: string;
      font_inputs?: {
        font_url?: string;
        text?: string;
      }[];
      fontInputs?: {
        fontUrl?: string;
        text?: string;
      }[];
      image_size?: "0.5K" | "1K" | "2K" | "4K";
      imageSize?: "0.5K" | "1K" | "2K" | "4K";
      include_rai_reason?: boolean;
      includeRaiReason?: boolean;
      reference_images?: {
        [key: string]: unknown;
      }[];
      referenceImages?: {
        [key: string]: unknown;
      }[];
      super_resolution_references?: string[];
      superResolutionReferences?: string[];
      [key: string]: unknown;
    };
    logit_bias?: {
      [key: string]: number;
    };
    logprobs?: boolean;
    max_completion_tokens?: number;
    max_output_tokens?: number;
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
      name?: string;
      role: "system" | "user" | "assistant" | "tool";
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
    modalities?: string[];
    model: string;
    parallel_tool_calls?: boolean;
    presence_penalty?: number;
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
    };
    reasoning?: {
      effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
      enabled?: boolean;
      include_thoughts?: boolean;
      includeThoughts?: boolean;
      max_tokens?: number;
      summary?: "auto" | "concise" | "detailed";
    };
    response_format?:
      | string
      | {
          schema?: {};
          type?: string;
        };
    response_modalities?: string[];
    responseModalities?: string[];
    seed?: number;
    service_tier?: "auto" | "default" | "flex" | "standard" | "priority";
    speed?: string;
    stream?: boolean;
    stream_options?: {};
    system?: string;
    temperature?: number;
    thinking?: {
      budget_tokens?: number;
      budgetTokens?: number;
      effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
      enabled?: boolean;
      include_thoughts?: boolean;
      includeThoughts?: boolean;
      max_tokens?: number;
      maxTokens?: number;
      type?: "enabled" | "disabled" | "adaptive";
    };
    tool_choice?: string | {};
    tools?: {
      type?: "function";
    }[];
    top_k?: number;
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
      name?: string;
      role: "system" | "user" | "assistant" | "tool";
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
        name?: string;
        role: "system" | "user" | "assistant" | "tool";
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
    embedding_options?: {
      google?: {
        output_dimensionality?: number;
        task_type?:
          | "TASK_TYPE_UNSPECIFIED"
          | "RETRIEVAL_QUERY"
          | "RETRIEVAL_DOCUMENT"
          | "SEMANTIC_SIMILARITY"
          | "CLASSIFICATION";
        title?: string;
      };
      mistral?: {
        output_dimension?: number | null;
        output_dtype?: "float" | "int8" | "uint8" | "binary" | "ubinary";
      };
    };
    encoding_format?: string;
    input?: string | string[];
    inputs?: string | string[];
    model?: string;
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
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

export type CreateProvisioningKeyParams = {
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
export async function createProvisioningKey(
  client: Client,
  args: CreateProvisioningKeyParams = {},
): Promise<{
  key?: {
    created_at?: string;
    id?: string;
    key?: string;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
  };
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/management/keys";
  return client.request<{
    key?: {
      created_at?: string;
      id?: string;
      key?: string;
      name?: string;
      prefix?: string;
      scopes?: string;
      status?: "active" | "disabled" | "revoked";
    };
    ok?: boolean;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateProvisioningKeyAliasParams = {
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
 * Alias of management key create endpoint.
 */
export async function createProvisioningKeyAlias(
  client: Client,
  args: CreateProvisioningKeyAliasParams = {},
): Promise<{
  key?: {
    created_at?: string;
    id?: string;
    key?: string;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
  };
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/provisioning/keys";
  return client.request<{
    key?: {
      created_at?: string;
      id?: string;
      key?: string;
      name?: string;
      prefix?: string;
      scopes?: string;
      status?: "active" | "disabled" | "revoked";
    };
    ok?: boolean;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateProvisioningKeyLegacyParams = {
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
 * Legacy alias of /management/keys create.
 */
export async function createProvisioningKeyLegacy(
  client: Client,
  args: CreateProvisioningKeyLegacyParams = {},
): Promise<{
  key?: {
    created_at?: string;
    id?: string;
    key?: string;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
  };
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/keys";
  return client.request<{
    key?: {
      created_at?: string;
      id?: string;
      key?: string;
      name?: string;
      prefix?: string;
      scopes?: string;
      status?: "active" | "disabled" | "revoked";
    };
    ok?: boolean;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateRealtimeCallPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Reserved endpoint for realtime calls. Currently returns not implemented.
 */
export async function createRealtimeCallPlaceholder(
  client: Client,
  args: CreateRealtimeCallPlaceholderParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/realtime/calls";
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateRealtimeClientSecretsPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Reserved endpoint for realtime client secrets. Currently returns not implemented.
 */
export async function createRealtimeClientSecretsPlaceholder(
  client: Client,
  args: CreateRealtimeClientSecretsPlaceholderParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/realtime/client_secrets";
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateRealtimeSessionPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Reserved endpoint for realtime API. Currently returns not implemented.
 */
export async function createRealtimeSessionPlaceholder(
  client: Client,
  args: CreateRealtimeSessionPlaceholderParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/realtime";
  return client.request<unknown>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type CreateRealtimeSessionsPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Reserved endpoint for realtime sessions. Currently returns not implemented.
 */
export async function createRealtimeSessionsPlaceholder(
  client: Client,
  args: CreateRealtimeSessionsPlaceholderParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/realtime/sessions";
  return client.request<unknown>({
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
    conversation?: string | {};
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    image_config?: {
      aspect_ratio?: string;
      aspectRatio?: string;
      font_inputs?: {
        font_url?: string;
        text?: string;
      }[];
      fontInputs?: {
        fontUrl?: string;
        text?: string;
      }[];
      image_size?: "0.5K" | "1K" | "2K" | "4K";
      imageSize?: "0.5K" | "1K" | "2K" | "4K";
      include_rai_reason?: boolean;
      includeRaiReason?: boolean;
      reference_images?: {
        [key: string]: unknown;
      }[];
      referenceImages?: {
        [key: string]: unknown;
      }[];
      super_resolution_references?: string[];
      superResolutionReferences?: string[];
      [key: string]: unknown;
    };
    imageConfig?: {
      aspect_ratio?: string;
      aspectRatio?: string;
      font_inputs?: {
        font_url?: string;
        text?: string;
      }[];
      fontInputs?: {
        fontUrl?: string;
        text?: string;
      }[];
      image_size?: "0.5K" | "1K" | "2K" | "4K";
      imageSize?: "0.5K" | "1K" | "2K" | "4K";
      include_rai_reason?: boolean;
      includeRaiReason?: boolean;
      reference_images?: {
        [key: string]: unknown;
      }[];
      referenceImages?: {
        [key: string]: unknown;
      }[];
      super_resolution_references?: string[];
      superResolutionReferences?: string[];
      [key: string]: unknown;
    };
    include?: string[];
    input?:
      | string
      | {
          content?: string | {}[] | {};
          phase?: "commentary" | "final_answer" | null;
          role?: "user" | "assistant" | "system" | "developer";
          type?: string;
        }[]
      | {};
    input_items?: {
      content?: string | {}[] | {};
      phase?: "commentary" | "final_answer" | null;
      role?: "user" | "assistant" | "system" | "developer";
      type?: string;
    }[];
    instructions?: string;
    max_completion_tokens?: number;
    max_output_tokens?: number;
    max_tokens?: number;
    max_tool_calls?: number;
    meta?: boolean;
    metadata?: {
      [key: string]: string;
    };
    modalities?: string[];
    model: string;
    parallel_tool_calls?: boolean;
    previous_response_id?: string;
    prompt?: {
      id?: string;
      variables?: {};
      version?: string;
    };
    prompt_cache_key?: string;
    prompt_cache_retention?: string;
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
    };
    provider_options?: {
      openai?: {
        context_management?: {
          compact_threshold?: number;
          type: "compaction";
        };
      };
    };
    providerOptions?: {
      openai?: {
        contextManagement?: {
          compactThreshold?: number;
          type: "compaction";
        };
      };
    };
    reasoning?: {
      effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
      enabled?: boolean;
      max_tokens?: number;
      summary?: string;
    };
    response_modalities?: string[];
    responseModalities?: string[];
    safety_identifier?: string;
    service_tier?: string;
    speed?: string;
    store?: boolean;
    stream?: boolean;
    stream_options?: {};
    temperature?: number;
    text?: {};
    thinking?: {
      budget_tokens?: number;
      budgetTokens?: number;
      effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
      enabled?: boolean;
      include_thoughts?: boolean;
      includeThoughts?: boolean;
      max_tokens?: number;
      maxTokens?: number;
      type?: "enabled" | "disabled" | "adaptive";
    };
    tool_choice?: string | {};
    tools?: {}[];
    top_logprobs?: number;
    top_p?: number;
    truncation?: string;
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
    content?: {}[];
    phase?: "commentary" | "final_answer" | null;
    role?: string;
    type?: string;
  }[];
  output_items?: {
    content?: {}[];
    phase?: "commentary" | "final_answer" | null;
    role?: string;
    type?: string;
  }[];
  role?: string;
  stop_reason?: string;
  type?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
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
      content?: {}[];
      phase?: "commentary" | "final_answer" | null;
      role?: string;
      type?: string;
    }[];
    output_items?: {
      content?: {}[];
      phase?: "commentary" | "final_answer" | null;
      role?: string;
      type?: string;
    }[];
    role?: string;
    stop_reason?: string;
    type?: string;
    usage?: {
      completion_tokens?: number;
      prompt_tokens?: number;
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
    duration?: number;
    duration_seconds?: number;
    enhance_prompt?: boolean;
    generate_audio?: boolean;
    input?: {
      image?: string | {};
      last_frame?: string | {};
      reference_images?: {
        image?: string | {};
        reference_type?: string;
        uri?: string;
        url?: string;
      }[];
      video?: string | {};
    };
    input_image?: string | {};
    input_last_frame?: string | {};
    input_reference?: string;
    input_reference_mime_type?: string;
    input_video?: string | {};
    last_frame?: string | {};
    model: string;
    negative_prompt?: string;
    number_of_videos?: number;
    output_storage_uri?: string;
    person_generation?: string;
    prompt: string;
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
    };
    quality?: string;
    ratio?: string;
    reference_images?: {}[];
    resolution?: string;
    sample_count?: number;
    seconds?: number | string;
    seed?: number;
    size?: string;
  };
};

/**
 * Creates a video from a prompt.
 */
export async function createVideo(
  client: Client,
  args: CreateVideoParams = {},
): Promise<{
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  output?: {
    id?: string;
    type?: string;
    url?: string;
  }[];
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/videos";
  return client.request<{
    created?: number;
    id?: string;
    model?: string;
    object?: string;
    output?: {
      id?: string;
      type?: string;
      url?: string;
    }[];
    status?: string;
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
    duration?: number;
    duration_seconds?: number;
    enhance_prompt?: boolean;
    generate_audio?: boolean;
    input?: {
      image?: string | {};
      last_frame?: string | {};
      reference_images?: {
        image?: string | {};
        reference_type?: string;
        uri?: string;
        url?: string;
      }[];
      video?: string | {};
    };
    input_image?: string | {};
    input_last_frame?: string | {};
    input_reference?: string;
    input_reference_mime_type?: string;
    input_video?: string | {};
    last_frame?: string | {};
    model: string;
    negative_prompt?: string;
    number_of_videos?: number;
    output_storage_uri?: string;
    person_generation?: string;
    prompt: string;
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
    };
    quality?: string;
    ratio?: string;
    reference_images?: {}[];
    resolution?: string;
    sample_count?: number;
    seconds?: number | string;
    seed?: number;
    size?: string;
  };
};

/**
 * Alias of /videos.
 */
export async function createVideoAlias(
  client: Client,
  args: CreateVideoAliasParams = {},
): Promise<{
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  output?: {
    id?: string;
    type?: string;
    url?: string;
  }[];
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/video/generations";
  return client.request<{
    created?: number;
    id?: string;
    model?: string;
    object?: string;
    output?: {
      id?: string;
      type?: string;
      url?: string;
    }[];
    status?: string;
  }>({
    method: "POST",
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

export type DeleteProvisioningKeyParams = {
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
export async function deleteProvisioningKey(
  client: Client,
  args: DeleteProvisioningKeyParams = {},
): Promise<{
  message?: string;
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/management/keys/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    message?: string;
    ok?: boolean;
  }>({
    method: "DELETE",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type DeleteProvisioningKeyAliasParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of management key delete endpoint.
 */
export async function deleteProvisioningKeyAlias(
  client: Client,
  args: DeleteProvisioningKeyAliasParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/provisioning/keys/${encodeURIComponent(String(path?.id))}`;
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
 * Deletes a video generation request.
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
    days?: number;
    limit?: number;
    offset?: number;
    team_id: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns recent API activity for a team.
 */
export async function getActivity(
  client: Client,
  args: GetActivityParams = {},
): Promise<{
  activity?: {
    cost_cents?: number;
    endpoint?: string;
    latency_ms?: number;
    model?: string;
    provider?: string;
    request_id?: string;
    timestamp?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  }[];
  limit?: number;
  offset?: number;
  ok?: boolean;
  period_days?: number;
  total?: number;
  total_cost_cents?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/activity";
  return client.request<{
    activity?: {
      cost_cents?: number;
      endpoint?: string;
      latency_ms?: number;
      model?: string;
      provider?: string;
      request_id?: string;
      timestamp?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
    }[];
    limit?: number;
    offset?: number;
    ok?: boolean;
    period_days?: number;
    total?: number;
    total_cost_cents?: number;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetAnalyticsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    access_token?: string;
    benchmark_id?:
      | "ace-bench"
      | "ai2-sciarena"
      | "ai2d"
      | "aidanbench"
      | "aider-polyglot"
      | "aime-2024"
      | "aime-2025"
      | "amc"
      | "apex-agents"
      | "arc-agi-1"
      | "arc-agi-2"
      | "arena-hard"
      | "autologi"
      | "balrog-ai"
      | "bfcl-overall-fc-v4"
      | "bigcodebench"
      | "browsecomp"
      | "browsecomp-long-context-128k"
      | "browsecomp-long-context-256k"
      | "c-eval"
      | "chartqa"
      | "charxiv-reasoning"
      | "cnmo-2024"
      | "codeforces"
      | "collie"
      | "confabulations"
      | "creative-story-writing"
      | "csimpleqa"
      | "docvqa"
      | "dubesor-llm"
      | "elimination-game"
      | "eqbench"
      | "erqa"
      | "evalplus"
      | "facts"
      | "facts-benchmark-suite"
      | "factscore-halluciation-rate"
      | "fiction-live-bench"
      | "frontier-math"
      | "galileo-agent"
      | "gdpval-aa"
      | "global-pica"
      | "gpqa"
      | "gpqa-diamond"
      | "graphwalks-bfs-lt-128k"
      | "graphwalks-parents-lt-128k"
      | "gsm8k"
      | "healthbench"
      | "healthbench-concensus"
      | "healthbench-hard"
      | "hmmt-2025"
      | "humaneval"
      | "humanitys-last-exam"
      | "if-bench"
      | "if-eval"
      | "imoanswerbench"
      | "iq-bench"
      | "lisanbench"
      | "livebench"
      | "livecodebench"
      | "livecodebench-coding"
      | "livecodebench-pro"
      | "livecodebench-v5"
      | "livecodebench-v6"
      | "lmarena-text"
      | "lmarena-webdev"
      | "longcodebench-1m"
      | "longfact-concepts-hallucination-rate"
      | "longfact-objects-hallucination-rate"
      | "math"
      | "math-500"
      | "matharena"
      | "matharena-apex"
      | "mathvista"
      | "mc-bench"
      | "metr"
      | "misguided-attention"
      | "mle-bench"
      | "mm-mt-bench"
      | "mmlu"
      | "mmlu-multilingual"
      | "mmlu-pro"
      | "mmlu-redux"
      | "mmlu-redux-2.0"
      | "mmmlu"
      | "mmmu"
      | "mmmu-pro"
      | "multi-challenge"
      | "multiPL-E"
      | "nyt-connections"
      | "ocrbench-v2"
      | "ojbench"
      | "omnidocbench-1.5"
      | "openai-mrcr-2-needle-128k"
      | "openai-mrcr-2-needle-256k"
      | "openai-mrcr-8-needle-128k"
      | "openai-mrcr-8-needle-1m"
      | "os-world"
      | "paperbench"
      | "phybench"
      | "polymath-en"
      | "qvhighlights"
      | "realkie"
      | "scale-mcp-atlas"
      | "scicode"
      | "screenspot"
      | "screenspot-pro"
      | "seal-multichallenege"
      | "simplebench"
      | "simpleqa"
      | "smolagents-llm"
      | "snake-bench"
      | "solo-bench"
      | "supergpqa"
      | "swe-bench"
      | "swe-bench-live"
      | "swe-bench-multilingual"
      | "swe-bench-pro"
      | "swe-lancer"
      | "symflower-coding"
      | "tau-2-airline"
      | "tau-2-bench"
      | "tau-2-retail"
      | "tau-2-telecom"
      | "tau-bench"
      | "tau-bench-airline"
      | "tau-bench-retail"
      | "terminal-bench"
      | "terminal-bench-2.0"
      | "thematic-generalisation"
      | "triviaqa"
      | "usamo-2025"
      | "vending-bench-2"
      | "video-mmmu"
      | "videomme"
      | "weirdml"
      | "wildbench"
      | "xlang-agent"
      | "zebralogic";
  };
};

/**
 * Returns aggregated analytics data.
 */
export async function getAnalytics(
  client: Client,
  args: GetAnalyticsParams = {},
): Promise<{
  message?: string;
  ok?: boolean;
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/analytics";
  return client.request<{
    message?: string;
    ok?: boolean;
    status?: string;
  }>({
    method: "POST",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetAudioRealtimeCallPlaceholderParams = {
  path?: {
    call_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of /realtime/calls/{call_id}. Currently returns not implemented.
 */
export async function getAudioRealtimeCallPlaceholder(
  client: Client,
  args: GetAudioRealtimeCallPlaceholderParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/audio/realtime/calls/${encodeURIComponent(String(path?.call_id))}`;
  return client.request<unknown>({
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

export type GetProvisioningKeyParams = {
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
export async function getProvisioningKey(
  client: Client,
  args: GetProvisioningKeyParams = {},
): Promise<{
  key?: {
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
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/management/keys/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    key?: {
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
    ok?: boolean;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetProvisioningKeyAliasParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Alias of management key details endpoint.
 */
export async function getProvisioningKeyAlias(
  client: Client,
  args: GetProvisioningKeyAliasParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/provisioning/keys/${encodeURIComponent(String(path?.id))}`;
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

export type GetProvisioningKeyLegacyParams = {
  path?: Record<string, never>;
  query?: {
    id: string;
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Legacy alias of /management/keys/{id} using query parameter id.
 */
export async function getProvisioningKeyLegacy(
  client: Client,
  args: GetProvisioningKeyLegacyParams = {},
): Promise<{
  key?: {
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
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/key";
  return client.request<{
    key?: {
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
    ok?: boolean;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type GetRealtimeCallPlaceholderParams = {
  path?: {
    call_id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Reserved endpoint for realtime call retrieval. Currently returns not implemented.
 */
export async function getRealtimeCallPlaceholder(
  client: Client,
  args: GetRealtimeCallPlaceholderParams = {},
): Promise<unknown> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/realtime/calls/${encodeURIComponent(String(path?.call_id))}`;
  return client.request<unknown>({
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
 * Retrieves the status for a video generation request.
 */
export async function getVideo(
  client: Client,
  args: GetVideoParams = {},
): Promise<{
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  output?: {
    id?: string;
    type?: string;
    url?: string;
  }[];
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/videos/${encodeURIComponent(String(path?.video_id))}`;
  return client.request<{
    created?: number;
    id?: string;
    model?: string;
    object?: string;
    output?: {
      id?: string;
      type?: string;
      url?: string;
    }[];
    status?: string;
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
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  output?: {
    id?: string;
    type?: string;
    url?: string;
  }[];
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/video/generations/${encodeURIComponent(String(path?.video_id))}`;
  return client.request<{
    created?: number;
    id?: string;
    model?: string;
    object?: string;
    output?: {
      id?: string;
      type?: string;
      url?: string;
    }[];
    status?: string;
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
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/keys/${encodeURIComponent(String(path?.id))}/invalidate`;
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

export type ListDataModelsParams = {
  path?: Record<string, never>;
  query?: {
    include_hidden?: boolean;
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
      | "lg"
      | "liquid-ai"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshot-ai"
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
      | "lg"
      | "liquid-ai"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshot-ai"
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
    | "ai21/jamba-2-3b-2026-01-08"
    | "ai21/jamba-2-mini-2026-01-08"
    | "ai21/jamba-large-1-5-2024-08-22"
    | "ai21/jamba-large-1-6-2025-03-06"
    | "ai21/jamba-large-1-7-2025-07-03"
    | "ai21/jamba-mini-1-5-2024-08-22"
    | "ai21/jamba-mini-1-6-2025-03-06"
    | "ai21/jamba-mini-1-7-2025-07-03"
    | "ai21/jamba-reasoning-3b-2025-10-08"
    | "aion-labs/aion-1-0-2025-01-29"
    | "aion-labs/aion-1-0-mini-2025-01-29"
    | "aion-labs/aion-2-0-2025-12-21"
    | "aion-labs/aion-rp-llama-3-1-8b-2024-11-30"
    | "allenai/bolmo-1b-2025-12-15"
    | "allenai/bolmo-7b-2025-12-15"
    | "allenai/molmo-2-4b-2025-12-16"
    | "allenai/molmo-2-8b-2025-12-16"
    | "allenai/olmo-3-1-32b-instruct-2025-12-12"
    | "allenai/olmo-3-1-32b-think-2025-12-12"
    | "allenai/olmo-3-32b-think-2025-11-20"
    | "allenai/olmo-3-7b-instruct-2025-11-20"
    | "allenai/olmo-3-7b-think-2025-11-20"
    | "amazon/nova-2-lite-2025-12-02"
    | "amazon/nova-2-omni-2025-12-02"
    | "amazon/nova-2-pro-2025-12-02"
    | "amazon/nova-2-sonic-2025-12-02"
    | "amazon/nova-canvas-2024-12-03"
    | "amazon/nova-lite-1-0-2024-12-04"
    | "amazon/nova-micro-1-0-2024-12-04"
    | "amazon/nova-multimodal-embeddings-2025-12-02"
    | "amazon/nova-premier-2025-04-30"
    | "amazon/nova-pro-1-0-2024-12-04"
    | "amazon/nova-reel-2024-12-03"
    | "amazon/nova-sonic-2025-04-08"
    | "anthropic/claude-1-0-2023-03-14"
    | "anthropic/claude-1-1"
    | "anthropic/claude-1-2"
    | "anthropic/claude-1-3"
    | "anthropic/claude-2-0-2023-07-12"
    | "anthropic/claude-2-1-2023-11-22"
    | "anthropic/claude-3-5-haiku-2024-11-04"
    | "anthropic/claude-3-5-sonnet-2024-06-21"
    | "anthropic/claude-3-5-sonnet-2024-10-22"
    | "anthropic/claude-3-7-sonnet-2025-02-24"
    | "anthropic/claude-3-haiku-2024-03-13"
    | "anthropic/claude-3-opus-2024-03-04"
    | "anthropic/claude-3-sonnet-2024-03-04"
    | "anthropic/claude-haiku-4-5-2025-10-15"
    | "anthropic/claude-instant-1-0-2023-03-14"
    | "anthropic/claude-instant-1-1"
    | "anthropic/claude-instant-1-2-2023-08-09"
    | "anthropic/claude-opus-4-1-2025-08-05"
    | "anthropic/claude-opus-4-2025-05-21"
    | "anthropic/claude-opus-4-5-2025-11-24"
    | "anthropic/claude-opus-4-6-2026-02-05"
    | "anthropic/claude-sonnet-4-2025-05-21"
    | "anthropic/claude-sonnet-4-5-2025-09-29"
    | "anthropic/claude-sonnet-4-6-2026-02-17"
    | "arcee-ai/trinity-large-2026-01-27"
    | "arcee-ai/trinity-mini-2025-12-01"
    | "arcee-ai/trinity-nano-preview-2025-12-01"
    | "baidu/ernie-4-5-21b-a3b"
    | "baidu/ernie-4-5-21b-a3b-thinking"
    | "baidu/ernie-4-5-300b-a47b"
    | "baidu/ernie-4-5-turbo"
    | "baidu/ernie-4-5-vl-28b-a3b"
    | "baidu/ernie-4-5-vl-424b-a47b"
    | "baidu/ernie-5-0-0110"
    | "baidu/ernie-5-0-2026-01-22"
    | "baidu/ernie-5-0-preview-1203"
    | "baidu/ernie-5-0-preview-1220"
    | "baidu/ernie-x1-1"
    | "baidu/qianfan-vl-3b"
    | "baidu/qianfan-vl-70b"
    | "baidu/qianfan-vl-8b"
    | "black-forest-labs/flux-2-dev-2025-11-25"
    | "black-forest-labs/flux-2-flex-2025-11-25"
    | "black-forest-labs/flux-2-klein-4b-2026-01-15"
    | "black-forest-labs/flux-2-klein-9b-2026-01-15"
    | "black-forest-labs/flux-2-max-2025-12-16"
    | "black-forest-labs/flux-2-pro-2025-11-25"
    | "bytedance/seed-1-6-2025-06-25"
    | "bytedance/seed-1-6-flash-2025-06-25"
    | "bytedance/seed-1-8-2025-12-18"
    | "bytedance/seed-2-0-lite-2026-02-14"
    | "bytedance/seed-2-0-mini-2026-02-14"
    | "bytedance/seed-2-0-pro-2026-02-14"
    | "bytedance/seed-coder-8b-instruct"
    | "bytedance/seed-coder-8b-reasoning"
    | "bytedance/seed-oss-36b-instruct"
    | "bytedance/seedream-4-5-2025-12-03"
    | "cohere/c4ai-aya-expanse-32b"
    | "cohere/c4ai-aya-expanse-8b"
    | "cohere/c4ai-aya-vision-32b-2025-03-04"
    | "cohere/c4ai-aya-vision-8b-2025-03-04"
    | "cohere/command"
    | "cohere/command-a-2025-03-13"
    | "cohere/command-a-reasoning-2025-08-21"
    | "cohere/command-a-translate-2025-08-28"
    | "cohere/command-a-vision-2025-07-31"
    | "cohere/command-light"
    | "cohere/command-r-2024-03-11"
    | "cohere/command-r-2024-08-30"
    | "cohere/command-r-7b-2024-12-13"
    | "cohere/command-r+-2024-04-04"
    | "cohere/command-r+-2024-08-30"
    | "cohere/embed-english-light-v2-0"
    | "cohere/embed-english-light-v3"
    | "cohere/embed-english-v2-0"
    | "cohere/embed-english-v3"
    | "cohere/embed-multilingual-light-v3"
    | "cohere/embed-multilingual-v2-0"
    | "cohere/embed-multilingual-v3"
    | "cohere/embed-v4-2025-04-15"
    | "cohere/rerank-multilingual-v3"
    | "cohere/rerank-v3-5-2024-10-02"
    | "cohere/rerank-v4-0-fast-2025-12-11"
    | "cohere/rerank-v4-0-pro-2025-12-11"
    | "cohere/rerenk-english-v3"
    | "cursor/composer-1-2025-10-29"
    | "cursor/composer-1-5-2026-02-09"
    | "deepseek/deepseek-coder-v2-2024-06-14"
    | "deepseek/deepseek-coder-v2-2024-07-24"
    | "deepseek/deepseek-ocr-2"
    | "deepseek/deepseek-ocr-2025-10-20"
    | "deepseek/deepseek-r1-2025-01-20"
    | "deepseek/deepseek-r1-2025-05-28"
    | "deepseek/deepseek-r1-lite-preview-2024-11-20"
    | "deepseek/deepseek-v2-2024-05-17"
    | "deepseek/deepseek-v2-2024-06-28"
    | "deepseek/deepseek-v2-5-2024-09-05"
    | "deepseek/deepseek-v2-5-2024-12-10"
    | "deepseek/deepseek-v3-1-2025-08-21"
    | "deepseek/deepseek-v3-1-terminus-2025-09-22"
    | "deepseek/deepseek-v3-2-2025-12-01"
    | "deepseek/deepseek-v3-2-exp-2025-09-29"
    | "deepseek/deepseek-v3-2-speciale-2025-12-01"
    | "deepseek/deepseek-v3-2024-12-26"
    | "deepseek/deepseek-v3-2025-03-25"
    | "deepseek/deepseek-v4"
    | "deepseek/deepseek-vl2-2024-12-13"
    | "deepseek/deepseek-vl2-small-2024-12-13"
    | "deepseek/deepseek-vl2-tiny-2024-12-13"
    | "eleven-labs/eleven-english-sts-v2"
    | "eleven-labs/eleven-flash-v2"
    | "eleven-labs/eleven-flash-v2-5"
    | "eleven-labs/eleven-monolingual-v1"
    | "eleven-labs/eleven-multilingual-sts-v2"
    | "eleven-labs/eleven-multilingual-ttv-v2"
    | "eleven-labs/eleven-multilingual-v1"
    | "eleven-labs/eleven-multilingual-v2"
    | "eleven-labs/eleven-ttv-v3"
    | "eleven-labs/eleven-turbo-v2"
    | "eleven-labs/eleven-turbo-v2-5"
    | "eleven-labs/eleven-v3"
    | "eleven-labs/scribe-v1"
    | "eleven-labs/scribe-v2-2026-01-09"
    | "eleven-labs/scribe-v2-realtime-2025-11-11"
    | "essential-ai/rnj-1-2025-12-06"
    | "google/chat-bison-2023-05-01"
    | "google/code-gecko-2023-05-01"
    | "google/embedding-001-2023-12-13"
    | "google/gemini-1-0-nano-2023-12-06"
    | "google/gemini-1-0-pro-2023-12-06"
    | "google/gemini-1-0-pro-vision-001-2024-02-15"
    | "google/gemini-1-0-ultra-2023-12-06"
    | "google/gemini-1-5-flash-001-2024-05-23"
    | "google/gemini-1-5-flash-002-2024-09-24"
    | "google/gemini-1-5-flash-8b-2024-03-15"
    | "google/gemini-1-5-flash-8b-exp-2024-08-27"
    | "google/gemini-1-5-flash-8b-exp-2024-09-24"
    | "google/gemini-1-5-flash-preview-2024-05-14"
    | "google/gemini-1-5-pro-001-2024-05-23"
    | "google/gemini-1-5-pro-002-2024-09-24"
    | "google/gemini-1-5-pro-exp-2024-08-01"
    | "google/gemini-1-5-pro-exp-2024-08-27"
    | "google/gemini-2-0-flash-2025-02-05"
    | "google/gemini-2-0-flash-exp"
    | "google/gemini-2-0-flash-exp-image-generation"
    | "google/gemini-2-0-flash-lite-2025-02-05"
    | "google/gemini-2-0-flash-live-001-2025-04-09"
    | "google/gemini-2-0-flash-preview-image-generation-2025-05-07"
    | "google/gemini-2-0-flash-thinking-exp-2024-12-19"
    | "google/gemini-2-0-flash-thinking-exp-2025-01-21"
    | "google/gemini-2-0-pro-exp-2025-02-05"
    | "google/gemini-2-5-computer-use-preview-2025-10-07"
    | "google/gemini-2-5-flash-exp-native-audio-thinking-dialog"
    | "google/gemini-2-5-flash-image-2025-10-02"
    | "google/gemini-2-5-flash-image-preview-2025-08-25"
    | "google/gemini-2-5-flash-lite-preview-2025-06-17"
    | "google/gemini-2-5-flash-lite-preview-2025-09-25"
    | "google/gemini-2-5-flash-native-audio-preview"
    | "google/gemini-2-5-flash-preview-2025-04-17"
    | "google/gemini-2-5-flash-preview-2025-05-20"
    | "google/gemini-2-5-flash-preview-2025-09-25"
    | "google/gemini-2-5-flash-preview-native-audio-dialog"
    | "google/gemini-2-5-flash-preview-tts"
    | "google/gemini-2-5-flash-preview-tts-2025-12-10"
    | "google/gemini-2-5-pro-experimental-2025-03-25"
    | "google/gemini-2-5-pro-preview-2025-05-06"
    | "google/gemini-2-5-pro-preview-2025-06-05"
    | "google/gemini-2-5-pro-preview-tts"
    | "google/gemini-2-5-pro-preview-tts-2025-12-10"
    | "google/gemini-3-1-flash-image-preview-2026-02-26"
    | "google/gemini-3-1-flash-lite-preview-2026-03-03"
    | "google/gemini-3-1-pro-preview-2026-02-19"
    | "google/gemini-3-flash-preview-2025-12-17"
    | "google/gemini-3-pro-image-preview-2025-11-20"
    | "google/gemini-3-pro-preview-2025-11-18"
    | "google/gemini-diffusion"
    | "google/gemini-embedding-001-2025-05-20"
    | "google/gemini-embedding-exp-0307-2025-03-07"
    | "google/gemini-exp-1114-2024-11-14"
    | "google/gemini-exp-1121-2024-11-21"
    | "google/gemini-exp-1206-2024-12-06"
    | "google/gemini-live-2-5-flash-preview-2025-04-09"
    | "google/gemini-robotics-er-1-5-preview-2025-09-25"
    | "google/gemma-1-2b-2024-02-21"
    | "google/gemma-1-7b-2024-02-21"
    | "google/gemma-2-27b-2024-06-27"
    | "google/gemma-2-2b-2024-07-31"
    | "google/gemma-2-9b-2024-06-27"
    | "google/gemma-3-12b-2025-03-12"
    | "google/gemma-3-1b-2025-03-12"
    | "google/gemma-3-27b-2025-03-12"
    | "google/gemma-3-4b-2025-03-12"
    | "google/gemma-3n-e2b-2025-06-25"
    | "google/gemma-3n-e4b-2025-06-25"
    | "google/image-generation-002-2023-08-17"
    | "google/image-generation-005-2023-11-22"
    | "google/image-generation-006-2024-03-27"
    | "google/image-text-2023-06-07"
    | "google/imagen-3-0-generate-001-2024-07-31"
    | "google/imagen-3-0-generate-002-2025-01-29"
    | "google/imagen-4-0-fast-generate-001-2025-08-14"
    | "google/imagen-4-0-fast-generate-preview-2025-06-11"
    | "google/imagen-4-0-generate-001-2025-08-14"
    | "google/imagen-4-0-generate-preview-2025-06-11"
    | "google/imagen-4-0-preview-2025-05-20"
    | "google/imagen-4-0-ultra-generate-001-2025-08-14"
    | "google/imagen-4-0-ultra-generate-preview-2025-06-11"
    | "google/imagen-4-0-ultra-preview-2025-05-20"
    | "google/learnlm-1-5-pro-experimental-2024-11-19"
    | "google/learnlm-2-0-flash-experimental-2025-04-17"
    | "google/lyria-1"
    | "google/lyria-2"
    | "google/lyria-3-2026-02-18"
    | "google/medgemma-1-5-4b-2026-01-13"
    | "google/multimodal-embedding-001-2024-02-12"
    | "google/text-bison-2023-05-01"
    | "google/text-embedding-004-2024-05-14"
    | "google/text-embedding-005-2024-11-18"
    | "google/text-embedding-gecko-001-2023-06-07"
    | "google/text-embedding-gecko-002-2023-11-02"
    | "google/text-embedding-gecko-003-2023-12-12"
    | "google/text-embedding-gecko-multilingual-001-2023-11-02"
    | "google/text-multilingual-embedding-002-2024-05-14"
    | "google/translategemma-12b-2026-01-15"
    | "google/translategemma-27b-2026-01-15"
    | "google/translategemma-4b-2026-01-15"
    | "google/veo-2-2025-04-09"
    | "google/veo-3-0-fast-generate-preview-2025-07-17"
    | "google/veo-3-0-generate-preview-2025-07-17"
    | "google/veo-3-1-fast-preview-2025-10-15"
    | "google/veo-3-1-preview-2025-10-15"
    | "google/veo-3-2"
    | "google/veo-3-2025-09-09"
    | "google/veo-3-fast-2025-09-09"
    | "google/veo-4"
    | "ibm/granite-20b-code-instruct-8k"
    | "ibm/granite-3-0-1b-a400m-instruct"
    | "ibm/granite-3-0-2b-instruct"
    | "ibm/granite-3-0-3b-a800m-instruct"
    | "ibm/granite-3-0-8b-instruct"
    | "ibm/granite-3-1-1b-a400m-instruct"
    | "ibm/granite-3-1-2b-instruct"
    | "ibm/granite-3-1-3b-a800m-instruct"
    | "ibm/granite-3-1-8b-instruct"
    | "ibm/granite-3-2-2b-instruct"
    | "ibm/granite-3-2-8b-instruct"
    | "ibm/granite-3-2-8b-instruct-preview"
    | "ibm/granite-3-3-2b-instruct-2025-04-16"
    | "ibm/granite-3-3-8b-instruct-2025-04-16"
    | "ibm/granite-34b-code-instruct-8b"
    | "ibm/granite-3b-code-instruct-128k"
    | "ibm/granite-3b-code-instruct-2k"
    | "ibm/granite-4-0-micro-2025-10-02"
    | "ibm/granite-4-0-small-2025-10-02"
    | "ibm/granite-4-0-tiny-2025-10-02"
    | "ibm/granite-4-0-tiny-preview-2025-05-02"
    | "ibm/granite-8b-code-instruct-128k"
    | "ibm/granite-8b-code-instruct-4k"
    | "ibm/granite-embedding-107m-multilingual"
    | "ibm/granite-embedding-125m-english"
    | "ibm/granite-embedding-278m-multilingual"
    | "ibm/granite-embedding-30m-english"
    | "ibm/granite-embedding-english-r2"
    | "ibm/granite-embedding-reranker-english-r2"
    | "ibm/granite-embedding-small-english-r2"
    | "ibm/granite-guardian-3-0-2b"
    | "ibm/granite-guardian-3-0-8b"
    | "ibm/granite-guardian-3-1-2b"
    | "ibm/granite-guardian-3-1-8b"
    | "ibm/granite-guardian-3-2-5b"
    | "ibm/granite-guardian-3-3-8b"
    | "ibm/granite-speech-3-2-8b"
    | "ibm/granite-speech-3-3-2b"
    | "ibm/granite-speech-3-3-8b"
    | "ibm/granite-vision-3-1-2b-preview"
    | "ibm/granite-vision-3-2-2b"
    | "ibm/granite-vision-3-3-2b"
    | "ibm/granite-vision-3-3-2b-embedding"
    | "inception/mercury-2-2026-02-24"
    | "inclusionai/ring-1t-2-5-2026-02-12"
    | "lg/exaone-3-0-2024-08-07"
    | "lg/exaone-3-5-2-4b-2024-12-09"
    | "lg/exaone-3-5-32b-2024-12-09"
    | "lg/exaone-3-5-7-8b-2024-12-09"
    | "lg/exaone-4-0-1-2b-2025-07-15"
    | "lg/exaone-4-0-32b-2025-07-15"
    | "lg/exaone-deep-2-4b-2025-03-18"
    | "lg/exaone-deep-32b-2025-03-18"
    | "lg/exaone-deep-7-8b-2025-03-18"
    | "lg/k-exaone-2025-12-31"
    | "liquid-ai/lfm-2-1-2b-2025-07-10"
    | "liquid-ai/lfm-2-2-6b-2025-09-23"
    | "liquid-ai/lfm-2-24b-a2b-2026-02-24"
    | "liquid-ai/lfm-2-350m-2025-07-10"
    | "liquid-ai/lfm-2-5-1-2b-2026-01-06"
    | "liquid-ai/lfm-2-5-1-2b-jp-2026-01-06"
    | "liquid-ai/lfm-2-5-1-2b-thinking-2026-01-20"
    | "liquid-ai/lfm-2-5-audio-1-5b"
    | "liquid-ai/lfm-2-5-vl-1-6b"
    | "liquid-ai/lfm-2-700m-2025-07-10"
    | "liquid-ai/lfm-2-8b-a1b-2025-10-07"
    | "meta/llama-2-13b-chat-2023-06-20"
    | "meta/llama-2-70b-chat-2023-06-20"
    | "meta/llama-2-7b-chat"
    | "meta/llama-3-1-405b-instruct-2024-07-23"
    | "meta/llama-3-1-70b-instruct-2024-07-23"
    | "meta/llama-3-1-8b-instruct-2024-07-23"
    | "meta/llama-3-2-11b-vision-instruct"
    | "meta/llama-3-2-1b-instruct-2024-09-25"
    | "meta/llama-3-2-3b-instruct-2024-09-25"
    | "meta/llama-3-2-90b-vision-instruct"
    | "meta/llama-3-3-70b-instruct-2024-12-06"
    | "meta/llama-3-70b-instruct-2024-04-18"
    | "meta/llama-3-8b-instruct-2024-04-18"
    | "meta/llama-4-maverick-2025-04-05"
    | "meta/llama-4-scout-2025-04-05"
    | "microsoft/phi-1"
    | "microsoft/phi-1-5"
    | "microsoft/phi-2"
    | "microsoft/phi-3-5-mini-instruct-2024-08-23"
    | "microsoft/phi-3-5-moe-instruct-2024-08-23"
    | "microsoft/phi-3-5-vision-instruct-2024-08-23"
    | "microsoft/phi-3-medium-128k-instruct"
    | "microsoft/phi-3-medium-4k-instruct"
    | "microsoft/phi-3-mini-128k-instruct"
    | "microsoft/phi-3-small-128k-instruct"
    | "microsoft/phi-3-small-8k-instruct"
    | "microsoft/phi-3-vision-128k-instruct"
    | "microsoft/phi-4-2024-12-12"
    | "microsoft/phi-4-mini-2025-02-01"
    | "microsoft/phi-4-mini-flash-reasoning"
    | "microsoft/phi-4-mini-reasoning-2025-04-30"
    | "microsoft/phi-4-multimodal-instruct-2025-02-01"
    | "microsoft/phi-4-reasoning-2025-04-30"
    | "microsoft/phi-4-reasoning-plus-2025-04-30"
    | "minimax/hailuo-02-2025-06-18"
    | "minimax/hailuo-2-3-2025-10-28"
    | "minimax/hailuo-2-3-fast-2025-10-28"
    | "minimax/i2v-01-director-2025-02-11"
    | "minimax/i2v-01-live"
    | "minimax/image-01-2025-02-15"
    | "minimax/minimax-m1-40k-2025-06-16"
    | "minimax/minimax-m1-80k-2025-06-16"
    | "minimax/minimax-m2-1-2025-12-23"
    | "minimax/minimax-m2-2025-10-27"
    | "minimax/minimax-m2-5-2026-02-12"
    | "minimax/minimax-m2-her-2026-01-24"
    | "minimax/minimax-text-01-2025-01-15"
    | "minimax/minimax-vl-01-2025-01-15"
    | "minimax/music-1-5-2025-06-20"
    | "minimax/music-2-0-2025-10-29"
    | "minimax/music-2-5-2026-01-16"
    | "minimax/s2v-01"
    | "minimax/speech-01-hd"
    | "minimax/speech-01-turbo"
    | "minimax/speech-02-hd-2025-04-02"
    | "minimax/speech-02-turbo-2025-04-02"
    | "minimax/speech-2-5-hd-preview-2025-08-06"
    | "minimax/speech-2-5-turbo-preview-2025-08-06"
    | "minimax/speech-2-6-2025-10-29"
    | "minimax/t2v-01-director-2025-02-11"
    | "mistral/codestral-2024-05-29"
    | "mistral/codestral-2025-01-13"
    | "mistral/codestral-2025-07-30"
    | "mistral/codestral-embed-2025-05-28"
    | "mistral/codestral-mamba-7b-2024-07-16"
    | "mistral/devstral-2-0-2025-12-09"
    | "mistral/devstral-medium-1-0-2025-07-10"
    | "mistral/devstral-small-1-0-2025-05-21"
    | "mistral/devstral-small-1-1-2025-07-10"
    | "mistral/devstral-small-2-0-2025-12-09"
    | "mistral/magistral-medium-1-0-2025-06-10"
    | "mistral/magistral-medium-1-1-2025-07-24"
    | "mistral/magistral-medium-1-2-2025-09-17"
    | "mistral/magistral-small-1-0-2025-06-10"
    | "mistral/magistral-small-1-1-2025-07-24"
    | "mistral/magistral-small-1-2-2025-09-17"
    | "mistral/mathstral-7b-2024-07-16"
    | "mistral/ministral-3-0-14b-2025-12-02"
    | "mistral/ministral-3-0-3b-2025-12-02"
    | "mistral/ministral-3-0-8b-2025-12-02"
    | "mistral/ministral-3b-2024-10-09"
    | "mistral/ministral-8b-2024-10-09"
    | "mistral/mistral-7b-2023-09-27"
    | "mistral/mistral-7b-2023-12-11"
    | "mistral/mistral-7b-2024-05-22"
    | "mistral/mistral-embed-2023-12-11"
    | "mistral/mistral-large-1-0-2024-02-26"
    | "mistral/mistral-large-2-0-2024-07-24"
    | "mistral/mistral-large-2-1-2024-11-18"
    | "mistral/mistral-large-3-0-2025-12-02"
    | "mistral/mistral-medium-1-0-2023-12-11"
    | "mistral/mistral-medium-3-0-2025-05-07"
    | "mistral/mistral-medium-3-1-2025-08-12"
    | "mistral/mistral-moderation-2024-11-06"
    | "mistral/mistral-nemo-12b-2024-07-18"
    | "mistral/mistral-ocr-2-2025-05-22"
    | "mistral/mistral-ocr-2025-03-06"
    | "mistral/mistral-saba-2025-02-17"
    | "mistral/mistral-small-1-0-2024-02-26"
    | "mistral/mistral-small-2-0-2024-09-17"
    | "mistral/mistral-small-3-0-2025-01-30"
    | "mistral/mistral-small-3-1-2025-03-17"
    | "mistral/mistral-small-3-2-2025-06-20"
    | "mistral/mistral-small-creative-2025-12-16"
    | "mistral/mixtral-8x22b-2024-04-17"
    | "mistral/mixtral-8x7b-2023-12-11"
    | "mistral/ocr-3-2025-12-18"
    | "mistral/pixtral-12b-2024-09-17"
    | "mistral/pixtral-large-2024-11-18"
    | "mistral/voxtral-mini-2025-07-15"
    | "mistral/voxtral-mini-transcribe-2-2026-02-04"
    | "mistral/voxtral-mini-transcribe-2025-07-15"
    | "mistral/voxtral-small-2025-07-15"
    | "moonshot-ai/kimi-k1-5-2025-01-20"
    | "moonshot-ai/kimi-k2-2025-07-11"
    | "moonshot-ai/kimi-k2-2025-09-05"
    | "moonshot-ai/kimi-k2-5-2026-01-27"
    | "moonshot-ai/kimi-k2-thinking-2025-11-06"
    | "moonshot-ai/kimi-linear-48b-2025-10-30"
    | "moonshot-ai/kimi-vl-a3b-2025-04-09"
    | "moonshot-ai/kimi-vl-a3b-thinking-2025-04-09"
    | "moonshot-ai/kimi-vl-a3b-thinking-2025-06-21"
    | "naver-hyperclova/hyperclova-x-seed-omni-8b-2025-12-29"
    | "naver-hyperclova/hyperclova-x-seed-think-14b-2025-07-22"
    | "naver-hyperclova/hyperclova-x-seed-think-32b-2025-12-29"
    | "nous/hermes-2-llama-2-70b-2024-02-12"
    | "nous/hermes-2-pro-llama-3-70b-2024-06-27"
    | "nous/hermes-2-pro-llama-3-8b-2024-05-01"
    | "nous/hermes-2-pro-mistral-7b-2024-03-13"
    | "nous/hermes-2-theta-llama-3-70b-2024-06-20"
    | "nous/hermes-2-theta-llama-3-8b-2024-05-15"
    | "nous/hermes-3-llama-3-1-405b-2024-08-15"
    | "nous/hermes-3-llama-3-1-70b-2024-08-15"
    | "nous/hermes-3-llama-3-1-8b-2024-08-15"
    | "nous/hermes-3-llama-3-2-3b-2024-12-11"
    | "nous/hermes-4-14b-2025-07-26"
    | "nous/hermes-4-3-36b-2025-12-03"
    | "nous/hermes-4-405b-2025-07-26"
    | "nous/hermes-4-70b-2025-07-26"
    | "nous/nomos-1-2025-12-09"
    | "nous/nouscoder-14b-2026-01-06"
    | "nvidia/llama-3-1-nemotron-70b-instruct-2024-10-01"
    | "nvidia/llama-3-1-nemotron-nano-4b-v1-1"
    | "nvidia/llama-3-1-nemotron-nano-8b-v1-2025-03-18"
    | "nvidia/llama-3-1-nemotron-ultra-253b-v1-2025-04-07"
    | "nvidia/llama-3-3-nemotron-super-49b-v1-2025-03-18"
    | "nvidia/llama-3-3-nemotron-super-49b-v1-5"
    | "nvidia/nemotron-nano-3-30b-a3b-2025-12-15"
    | "nvidia/nvidia-nemotron-nano-12b-v2"
    | "nvidia/nvidia-nemotron-nano-9b-v2"
    | "nvidia/openreasoning-nemotron-1-5b"
    | "nvidia/openreasoning-nemotron-14b"
    | "nvidia/openreasoning-nemotron-32b"
    | "nvidia/openreasoning-nemotron-7b"
    | "openai/ada-2020-06-11"
    | "openai/babbage-002-2023-08-22"
    | "openai/babbage-2020-06-11"
    | "openai/chatgpt-4o-2024-05-13"
    | "openai/chatgpt-image-latest-2025-12-16"
    | "openai/code-cushman-001"
    | "openai/code-cushman-002"
    | "openai/code-davinci-001"
    | "openai/code-davinci-002"
    | "openai/code-davinci-edit-001"
    | "openai/code-search-ada-code-001"
    | "openai/code-search-ada-text-001"
    | "openai/code-search-babbage-code-001"
    | "openai/code-search-babbage-text-001"
    | "openai/codex-mini-2025-05-16"
    | "openai/computer-use-preview-2025-03-11"
    | "openai/curie-2020-06-11"
    | "openai/dall-e-2-2022-09-28"
    | "openai/dall-e-2021-01-05"
    | "openai/dall-e-3-2023-10-19"
    | "openai/davinci-002-2023-08-22"
    | "openai/davinci-2020-06-11"
    | "openai/gpt-1-2018-06-11"
    | "openai/gpt-2-2019-11-05"
    | "openai/gpt-3-2020-06-11"
    | "openai/gpt-3-5-turbo-0613"
    | "openai/gpt-3-5-turbo-16k-0613-2023-06-13"
    | "openai/gpt-3-5-turbo-2023-03-21"
    | "openai/gpt-3-5-turbo-2023-09-28"
    | "openai/gpt-3-5-turbo-2023-11-06"
    | "openai/gpt-4-1-2025-04-14"
    | "openai/gpt-4-1-mini-2025-04-14"
    | "openai/gpt-4-1-nano-2025-04-14"
    | "openai/gpt-4-2023-03-14"
    | "openai/gpt-4-2023-06-13"
    | "openai/gpt-4-32k"
    | "openai/gpt-4-32k-0314"
    | "openai/gpt-4-32k-0613"
    | "openai/gpt-4-5-2025-02-27"
    | "openai/gpt-4-turbo-2023-03-14"
    | "openai/gpt-4-turbo-2023-11-06"
    | "openai/gpt-4-turbo-2024-01-25"
    | "openai/gpt-4o-2024-05-13"
    | "openai/gpt-4o-2024-08-06"
    | "openai/gpt-4o-2024-11-20"
    | "openai/gpt-4o-audio-2024-10-01"
    | "openai/gpt-4o-audio-2024-12-17"
    | "openai/gpt-4o-audio-2025-06-03"
    | "openai/gpt-4o-mini-2024-07-18"
    | "openai/gpt-4o-mini-audio-preview-2024-12-17"
    | "openai/gpt-4o-mini-realtime-preview-2024-12-17"
    | "openai/gpt-4o-mini-search-preview-2025-03-11"
    | "openai/gpt-4o-mini-transcribe-2025-03-20"
    | "openai/gpt-4o-mini-transcribe-2025-12-15"
    | "openai/gpt-4o-mini-tts-2025-03-20"
    | "openai/gpt-4o-mini-tts-2025-12-15"
    | "openai/gpt-4o-realtime-preview-2024-10-01"
    | "openai/gpt-4o-realtime-preview-2024-12-17"
    | "openai/gpt-4o-realtime-preview-2025-06-03"
    | "openai/gpt-4o-search-preview-2025-03-11"
    | "openai/gpt-4o-transcribe-2025-03-20"
    | "openai/gpt-4o-transcribe-diarize-2025-10-15"
    | "openai/gpt-5-1-2025-11-12"
    | "openai/gpt-5-1-chat-2025-11-13"
    | "openai/gpt-5-1-codex-2025-11-13"
    | "openai/gpt-5-1-codex-max-2025-11-19"
    | "openai/gpt-5-1-codex-mini-2025-11-13"
    | "openai/gpt-5-1-pro"
    | "openai/gpt-5-2-2025-12-11"
    | "openai/gpt-5-2-chat-2025-12-11"
    | "openai/gpt-5-2-codex-2025-12-18"
    | "openai/gpt-5-2-mini"
    | "openai/gpt-5-2-pro-2025-12-11"
    | "openai/gpt-5-2025-08-07"
    | "openai/gpt-5-3-chat-2026-03-03"
    | "openai/gpt-5-3-codex-2026-02-05"
    | "openai/gpt-5-3-codex-spark-2026-02-12"
    | "openai/gpt-5-4"
    | "openai/gpt-5-chat-2025-08-07"
    | "openai/gpt-5-codex-2025-09-15"
    | "openai/gpt-5-codex-mini-2025-11-07"
    | "openai/gpt-5-mini-2025-08-07"
    | "openai/gpt-5-nano-2025-08-07"
    | "openai/gpt-5-pro-2025-08-07"
    | "openai/gpt-5-search-api-2025-10-14"
    | "openai/gpt-audio-1-5-2026-02-23"
    | "openai/gpt-audio-2025-08-28"
    | "openai/gpt-audio-mini-2025-10-06"
    | "openai/gpt-audio-mini-2025-12-15"
    | "openai/gpt-image-1-2025-04-23"
    | "openai/gpt-image-1-5-2025-12-16"
    | "openai/gpt-image-1-mini-2025-10-06"
    | "openai/gpt-oss-120b-2025-08-05"
    | "openai/gpt-oss-20b-2025-08-05"
    | "openai/gpt-oss-safeguard-120b-2025-10-29"
    | "openai/gpt-oss-safeguard-20b-2025-10-29"
    | "openai/gpt-realtime-1-5-2026-02-23"
    | "openai/gpt-realtime-2025-08-28"
    | "openai/gpt-realtime-mini-2025-10-06"
    | "openai/gpt-realtime-mini-2025-12-15"
    | "openai/o1-2024-12-17"
    | "openai/o1-mini-2024-09-12"
    | "openai/o1-preview-2024-09-12"
    | "openai/o1-pro-2025-03-19"
    | "openai/o3-2025-04-16"
    | "openai/o3-deep-research-2025-06-26"
    | "openai/o3-mini-2025-01-30"
    | "openai/o3-preview"
    | "openai/o3-pro-2025-06-10"
    | "openai/o4-mini-2025-04-16"
    | "openai/o4-mini-deep-research-2025-06-26"
    | "openai/omni-moderation-2024-09-26"
    | "openai/sora-1-2024-12-09"
    | "openai/sora-2-2025-09-30"
    | "openai/sora-2-2025-12-08"
    | "openai/sora-2-pro-2025-10-03"
    | "openai/text-ada-001"
    | "openai/text-babbage-001"
    | "openai/text-curie-001"
    | "openai/text-davinci-001"
    | "openai/text-davinci-002"
    | "openai/text-davinci-003"
    | "openai/text-davinci-edit-001"
    | "openai/text-embedding-3-large-2024-01-25"
    | "openai/text-embedding-3-small-2024-01-25"
    | "openai/text-embedding-ada-002-2022-12-15"
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
    | "openai/tts-1-2023-11-06"
    | "openai/tts-1-hd-2023-11-06"
    | "openai/whisper-1-2023-03-01"
    | "prime-intellect/intellect-3-1-2026-02-18"
    | "prime-intellect/intellect-3-2025-11-26"
    | "qwen/code-qwen-1-5-7b"
    | "qwen/qvq-72b-preview"
    | "qwen/qwen-1-5-0-5b"
    | "qwen/qwen-1-5-1-8b"
    | "qwen/qwen-1-5-110b"
    | "qwen/qwen-1-5-14b"
    | "qwen/qwen-1-5-32b"
    | "qwen/qwen-1-5-4b"
    | "qwen/qwen-1-5-72b"
    | "qwen/qwen-1-5-7b"
    | "qwen/qwen-1-5-moe-a2-7b"
    | "qwen/qwen-1-8b"
    | "qwen/qwen-14b"
    | "qwen/qwen-2-0-5b"
    | "qwen/qwen-2-1-5b"
    | "qwen/qwen-2-5-0-5b"
    | "qwen/qwen-2-5-1-5b"
    | "qwen/qwen-2-5-14b"
    | "qwen/qwen-2-5-32b"
    | "qwen/qwen-2-5-3b"
    | "qwen/qwen-2-5-72b"
    | "qwen/qwen-2-5-7b"
    | "qwen/qwen-2-5-coder-0-5b"
    | "qwen/qwen-2-5-coder-1-5b"
    | "qwen/qwen-2-5-coder-14b"
    | "qwen/qwen-2-5-coder-32b-instruct"
    | "qwen/qwen-2-5-coder-3b"
    | "qwen/qwen-2-5-coder-7b"
    | "qwen/qwen-2-5-math-1-5b"
    | "qwen/qwen-2-5-math-72b"
    | "qwen/qwen-2-5-math-7b"
    | "qwen/qwen-2-5-math-7b-prm800k"
    | "qwen/qwen-2-5-math-prm-72b"
    | "qwen/qwen-2-5-math-prm-7b"
    | "qwen/qwen-2-5-math-rm-72b"
    | "qwen/qwen-2-5-omni-3b"
    | "qwen/qwen-2-5-omni-7b"
    | "qwen/qwen-2-5-vl-32b-instruct"
    | "qwen/qwen-2-5-vl-3b-instruct"
    | "qwen/qwen-2-5-vl-72b-instruct"
    | "qwen/qwen-2-5-vl-7b-instruct"
    | "qwen/qwen-2-72b-instruct"
    | "qwen/qwen-2-7b-instruct"
    | "qwen/qwen-2-audio-7b"
    | "qwen/qwen-2-math-1-5b"
    | "qwen/qwen-2-math-72b"
    | "qwen/qwen-2-math-7b"
    | "qwen/qwen-2-math-rm-72b"
    | "qwen/qwen-2-vl-2b"
    | "qwen/qwen-2-vl-72b"
    | "qwen/qwen-2-vl-7b"
    | "qwen/qwen-3-0-6b"
    | "qwen/qwen-3-1-7b"
    | "qwen/qwen-3-14b"
    | "qwen/qwen-3-235b-a22b"
    | "qwen/qwen-3-235b-a22b-thinking-2507"
    | "qwen/qwen-3-30b-a3b"
    | "qwen/qwen-3-30b-a3b-instruct-2507"
    | "qwen/qwen-3-30b-a3b-thinking-2507"
    | "qwen/qwen-3-32b"
    | "qwen/qwen-3-4b"
    | "qwen/qwen-3-4b-instruct-2507"
    | "qwen/qwen-3-4b-saferl"
    | "qwen/qwen-3-4b-thinking-2507"
    | "qwen/qwen-3-5-0-8b-2026-03-02"
    | "qwen/qwen-3-5-122b-a10b-2026-02-24"
    | "qwen/qwen-3-5-27b-2026-02-24"
    | "qwen/qwen-3-5-2b-2026-03-02"
    | "qwen/qwen-3-5-35b-a3b-2026-02-24"
    | "qwen/qwen-3-5-397b-a17b-2026-02-16"
    | "qwen/qwen-3-5-4b-2026-03-02"
    | "qwen/qwen-3-5-9b-2026-03-02"
    | "qwen/qwen-3-5-flash-2026-02-23"
    | "qwen/qwen-3-5-plus-2026-02-16"
    | "qwen/qwen-3-8b"
    | "qwen/qwen-3-a235-a22b-instruct-2507"
    | "qwen/qwen-3-asr-0-6b"
    | "qwen/qwen-3-asr-1-7b"
    | "qwen/qwen-3-coder-30b-a3b-instruct"
    | "qwen/qwen-3-coder-480b-a35b-instruct"
    | "qwen/qwen-3-coder-next"
    | "qwen/qwen-3-embedding-0-6b"
    | "qwen/qwen-3-embedding-4b"
    | "qwen/qwen-3-embedding-8b"
    | "qwen/qwen-3-forcedaligner-0-6b"
    | "qwen/qwen-3-guard-gen-0-6b"
    | "qwen/qwen-3-guard-gen-4b"
    | "qwen/qwen-3-guard-gen-8b"
    | "qwen/qwen-3-guard-stream-0-6b"
    | "qwen/qwen-3-guard-stream-4b"
    | "qwen/qwen-3-guard-stream-8b"
    | "qwen/qwen-3-max-thinking-2026-01-26"
    | "qwen/qwen-3-next-80b-a3b-instruct"
    | "qwen/qwen-3-next-80b-a3b-thinking"
    | "qwen/qwen-3-omni-30b-a3b-captioner"
    | "qwen/qwen-3-omni-30b-a3b-instruct"
    | "qwen/qwen-3-omni-30b-a3b-thinking"
    | "qwen/qwen-3-omni-flash"
    | "qwen/qwen-3-reranker-0-6b"
    | "qwen/qwen-3-reranker-4b"
    | "qwen/qwen-3-reranker-8b"
    | "qwen/qwen-3-tts"
    | "qwen/qwen-3-tts-12hz-0-6b-base"
    | "qwen/qwen-3-tts-12hz-0-6b-customvoice"
    | "qwen/qwen-3-tts-12hz-1-7b-base"
    | "qwen/qwen-3-tts-12hz-1-7b-voicedesign"
    | "qwen/qwen-3-tts-tokenizer-12hz"
    | "qwen/qwen-3-vl-235b-a22b-instruct"
    | "qwen/qwen-3-vl-235b-a22b-thinking"
    | "qwen/qwen-3-vl-2b-instruct"
    | "qwen/qwen-3-vl-2b-thinking"
    | "qwen/qwen-3-vl-30b-a3b-instruct"
    | "qwen/qwen-3-vl-30b-a3b-thinking"
    | "qwen/qwen-3-vl-32b-instruct"
    | "qwen/qwen-3-vl-32b-thinking"
    | "qwen/qwen-3-vl-4b-instruct"
    | "qwen/qwen-3-vl-4b-thinking"
    | "qwen/qwen-3-vl-8b-instruct"
    | "qwen/qwen-3-vl-8b-thinking"
    | "qwen/qwen-3-vl-embedding-2b"
    | "qwen/qwen-3-vl-embedding-8b"
    | "qwen/qwen-3-vl-reranker-2b"
    | "qwen/qwen-3-vl-reranker-8b"
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
    | "suno/suno-v3-5-2024-05-25"
    | "suno/suno-v4-2024-11-19"
    | "suno/suno-v4-5-2025-05-01"
    | "suno/suno-v4-5-all-2025-10-27"
    | "suno/suno-v4-5+-2025-07-17"
    | "suno/suno-v5-2025-09-23"
    | "upstage/solar-pro"
    | "upstage/solar-pro-2-2025-07-10"
    | "upstage/solar-pro-2-2025-09-09"
    | "upstage/solar-pro-2-2025-12-15"
    | "upstage/solar-pro-2-preview-2025-05-20"
    | "upstage/solar-pro-3-2026-01-26"
    | "vercel/v0-1-0-md"
    | "vercel/v0-1-5-lg"
    | "vercel/v0-1-5-md"
    | "vercel/v0-1-5-sm"
    | "x-ai/grok-0"
    | "x-ai/grok-1"
    | "x-ai/grok-1-5-2024-03-28"
    | "x-ai/grok-1-5v-2024-04-12"
    | "x-ai/grok-2-2024-08-13"
    | "x-ai/grok-2-image-1212"
    | "x-ai/grok-2-mini-2024-08-13"
    | "x-ai/grok-2-vision-1212"
    | "x-ai/grok-3-2025-04-18"
    | "x-ai/grok-3-beta-2025-02-19"
    | "x-ai/grok-3-mini-2025-04-18"
    | "x-ai/grok-3-mini-beta-2025-02-19"
    | "x-ai/grok-4-1-non-thinking-2025-11-17"
    | "x-ai/grok-4-1-thinking-2025-11-17"
    | "x-ai/grok-4-2"
    | "x-ai/grok-4-2025-07-10"
    | "x-ai/grok-4-fast-non-reasoning-2025-09-20"
    | "x-ai/grok-4-fast-reasoning-2025-09-20"
    | "x-ai/grok-4-heavy-2025-07-10"
    | "x-ai/grok-code-fast-1-2025-08-28"
    | "x-ai/grok-imagine-image-2026-01-29"
    | "x-ai/grok-imagine-image-pro-2026-01-29"
    | "x-ai/grok-imagine-video-2026-01-29"
    | "xiaomi/mimo-v2-flash-2025-12-16"
    | "z-ai/glm-4-1v-9b-2025-07-02"
    | "z-ai/glm-4-1v-thinking-9b-2025-07-02"
    | "z-ai/glm-4-32b-2025-04-15"
    | "z-ai/glm-4-5-2025-07-28"
    | "z-ai/glm-4-5-air-2025-07-28"
    | "z-ai/glm-4-5-air-x"
    | "z-ai/glm-4-5-x"
    | "z-ai/glm-4-5v-2025-08-11"
    | "z-ai/glm-4-6-2025-09-30"
    | "z-ai/glm-4-6v-2025-12-08"
    | "z-ai/glm-4-6v-flash-2025-12-08"
    | "z-ai/glm-4-7-2025-12-22"
    | "z-ai/glm-4-7-flash-2026-01-19"
    | "z-ai/glm-4-9b-2024-06-04"
    | "z-ai/glm-4-9b-2025-04-14"
    | "z-ai/glm-4-9b-chat-1m-2024-10-24"
    | "z-ai/glm-4-9b-chat-2024-06-04"
    | "z-ai/glm-4v-9b"
    | "z-ai/glm-5-2026-02-11"
    | "z-ai/glm-5-code"
    | "z-ai/glm-image-2026-01-14"[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/endpoints";
  return client.request<{
    endpoints?: string[];
    ok?: boolean;
    sample_models?:
      | "ai21/jamba-2-3b-2026-01-08"
      | "ai21/jamba-2-mini-2026-01-08"
      | "ai21/jamba-large-1-5-2024-08-22"
      | "ai21/jamba-large-1-6-2025-03-06"
      | "ai21/jamba-large-1-7-2025-07-03"
      | "ai21/jamba-mini-1-5-2024-08-22"
      | "ai21/jamba-mini-1-6-2025-03-06"
      | "ai21/jamba-mini-1-7-2025-07-03"
      | "ai21/jamba-reasoning-3b-2025-10-08"
      | "aion-labs/aion-1-0-2025-01-29"
      | "aion-labs/aion-1-0-mini-2025-01-29"
      | "aion-labs/aion-2-0-2025-12-21"
      | "aion-labs/aion-rp-llama-3-1-8b-2024-11-30"
      | "allenai/bolmo-1b-2025-12-15"
      | "allenai/bolmo-7b-2025-12-15"
      | "allenai/molmo-2-4b-2025-12-16"
      | "allenai/molmo-2-8b-2025-12-16"
      | "allenai/olmo-3-1-32b-instruct-2025-12-12"
      | "allenai/olmo-3-1-32b-think-2025-12-12"
      | "allenai/olmo-3-32b-think-2025-11-20"
      | "allenai/olmo-3-7b-instruct-2025-11-20"
      | "allenai/olmo-3-7b-think-2025-11-20"
      | "amazon/nova-2-lite-2025-12-02"
      | "amazon/nova-2-omni-2025-12-02"
      | "amazon/nova-2-pro-2025-12-02"
      | "amazon/nova-2-sonic-2025-12-02"
      | "amazon/nova-canvas-2024-12-03"
      | "amazon/nova-lite-1-0-2024-12-04"
      | "amazon/nova-micro-1-0-2024-12-04"
      | "amazon/nova-multimodal-embeddings-2025-12-02"
      | "amazon/nova-premier-2025-04-30"
      | "amazon/nova-pro-1-0-2024-12-04"
      | "amazon/nova-reel-2024-12-03"
      | "amazon/nova-sonic-2025-04-08"
      | "anthropic/claude-1-0-2023-03-14"
      | "anthropic/claude-1-1"
      | "anthropic/claude-1-2"
      | "anthropic/claude-1-3"
      | "anthropic/claude-2-0-2023-07-12"
      | "anthropic/claude-2-1-2023-11-22"
      | "anthropic/claude-3-5-haiku-2024-11-04"
      | "anthropic/claude-3-5-sonnet-2024-06-21"
      | "anthropic/claude-3-5-sonnet-2024-10-22"
      | "anthropic/claude-3-7-sonnet-2025-02-24"
      | "anthropic/claude-3-haiku-2024-03-13"
      | "anthropic/claude-3-opus-2024-03-04"
      | "anthropic/claude-3-sonnet-2024-03-04"
      | "anthropic/claude-haiku-4-5-2025-10-15"
      | "anthropic/claude-instant-1-0-2023-03-14"
      | "anthropic/claude-instant-1-1"
      | "anthropic/claude-instant-1-2-2023-08-09"
      | "anthropic/claude-opus-4-1-2025-08-05"
      | "anthropic/claude-opus-4-2025-05-21"
      | "anthropic/claude-opus-4-5-2025-11-24"
      | "anthropic/claude-opus-4-6-2026-02-05"
      | "anthropic/claude-sonnet-4-2025-05-21"
      | "anthropic/claude-sonnet-4-5-2025-09-29"
      | "anthropic/claude-sonnet-4-6-2026-02-17"
      | "arcee-ai/trinity-large-2026-01-27"
      | "arcee-ai/trinity-mini-2025-12-01"
      | "arcee-ai/trinity-nano-preview-2025-12-01"
      | "baidu/ernie-4-5-21b-a3b"
      | "baidu/ernie-4-5-21b-a3b-thinking"
      | "baidu/ernie-4-5-300b-a47b"
      | "baidu/ernie-4-5-turbo"
      | "baidu/ernie-4-5-vl-28b-a3b"
      | "baidu/ernie-4-5-vl-424b-a47b"
      | "baidu/ernie-5-0-0110"
      | "baidu/ernie-5-0-2026-01-22"
      | "baidu/ernie-5-0-preview-1203"
      | "baidu/ernie-5-0-preview-1220"
      | "baidu/ernie-x1-1"
      | "baidu/qianfan-vl-3b"
      | "baidu/qianfan-vl-70b"
      | "baidu/qianfan-vl-8b"
      | "black-forest-labs/flux-2-dev-2025-11-25"
      | "black-forest-labs/flux-2-flex-2025-11-25"
      | "black-forest-labs/flux-2-klein-4b-2026-01-15"
      | "black-forest-labs/flux-2-klein-9b-2026-01-15"
      | "black-forest-labs/flux-2-max-2025-12-16"
      | "black-forest-labs/flux-2-pro-2025-11-25"
      | "bytedance/seed-1-6-2025-06-25"
      | "bytedance/seed-1-6-flash-2025-06-25"
      | "bytedance/seed-1-8-2025-12-18"
      | "bytedance/seed-2-0-lite-2026-02-14"
      | "bytedance/seed-2-0-mini-2026-02-14"
      | "bytedance/seed-2-0-pro-2026-02-14"
      | "bytedance/seed-coder-8b-instruct"
      | "bytedance/seed-coder-8b-reasoning"
      | "bytedance/seed-oss-36b-instruct"
      | "bytedance/seedream-4-5-2025-12-03"
      | "cohere/c4ai-aya-expanse-32b"
      | "cohere/c4ai-aya-expanse-8b"
      | "cohere/c4ai-aya-vision-32b-2025-03-04"
      | "cohere/c4ai-aya-vision-8b-2025-03-04"
      | "cohere/command"
      | "cohere/command-a-2025-03-13"
      | "cohere/command-a-reasoning-2025-08-21"
      | "cohere/command-a-translate-2025-08-28"
      | "cohere/command-a-vision-2025-07-31"
      | "cohere/command-light"
      | "cohere/command-r-2024-03-11"
      | "cohere/command-r-2024-08-30"
      | "cohere/command-r-7b-2024-12-13"
      | "cohere/command-r+-2024-04-04"
      | "cohere/command-r+-2024-08-30"
      | "cohere/embed-english-light-v2-0"
      | "cohere/embed-english-light-v3"
      | "cohere/embed-english-v2-0"
      | "cohere/embed-english-v3"
      | "cohere/embed-multilingual-light-v3"
      | "cohere/embed-multilingual-v2-0"
      | "cohere/embed-multilingual-v3"
      | "cohere/embed-v4-2025-04-15"
      | "cohere/rerank-multilingual-v3"
      | "cohere/rerank-v3-5-2024-10-02"
      | "cohere/rerank-v4-0-fast-2025-12-11"
      | "cohere/rerank-v4-0-pro-2025-12-11"
      | "cohere/rerenk-english-v3"
      | "cursor/composer-1-2025-10-29"
      | "cursor/composer-1-5-2026-02-09"
      | "deepseek/deepseek-coder-v2-2024-06-14"
      | "deepseek/deepseek-coder-v2-2024-07-24"
      | "deepseek/deepseek-ocr-2"
      | "deepseek/deepseek-ocr-2025-10-20"
      | "deepseek/deepseek-r1-2025-01-20"
      | "deepseek/deepseek-r1-2025-05-28"
      | "deepseek/deepseek-r1-lite-preview-2024-11-20"
      | "deepseek/deepseek-v2-2024-05-17"
      | "deepseek/deepseek-v2-2024-06-28"
      | "deepseek/deepseek-v2-5-2024-09-05"
      | "deepseek/deepseek-v2-5-2024-12-10"
      | "deepseek/deepseek-v3-1-2025-08-21"
      | "deepseek/deepseek-v3-1-terminus-2025-09-22"
      | "deepseek/deepseek-v3-2-2025-12-01"
      | "deepseek/deepseek-v3-2-exp-2025-09-29"
      | "deepseek/deepseek-v3-2-speciale-2025-12-01"
      | "deepseek/deepseek-v3-2024-12-26"
      | "deepseek/deepseek-v3-2025-03-25"
      | "deepseek/deepseek-v4"
      | "deepseek/deepseek-vl2-2024-12-13"
      | "deepseek/deepseek-vl2-small-2024-12-13"
      | "deepseek/deepseek-vl2-tiny-2024-12-13"
      | "eleven-labs/eleven-english-sts-v2"
      | "eleven-labs/eleven-flash-v2"
      | "eleven-labs/eleven-flash-v2-5"
      | "eleven-labs/eleven-monolingual-v1"
      | "eleven-labs/eleven-multilingual-sts-v2"
      | "eleven-labs/eleven-multilingual-ttv-v2"
      | "eleven-labs/eleven-multilingual-v1"
      | "eleven-labs/eleven-multilingual-v2"
      | "eleven-labs/eleven-ttv-v3"
      | "eleven-labs/eleven-turbo-v2"
      | "eleven-labs/eleven-turbo-v2-5"
      | "eleven-labs/eleven-v3"
      | "eleven-labs/scribe-v1"
      | "eleven-labs/scribe-v2-2026-01-09"
      | "eleven-labs/scribe-v2-realtime-2025-11-11"
      | "essential-ai/rnj-1-2025-12-06"
      | "google/chat-bison-2023-05-01"
      | "google/code-gecko-2023-05-01"
      | "google/embedding-001-2023-12-13"
      | "google/gemini-1-0-nano-2023-12-06"
      | "google/gemini-1-0-pro-2023-12-06"
      | "google/gemini-1-0-pro-vision-001-2024-02-15"
      | "google/gemini-1-0-ultra-2023-12-06"
      | "google/gemini-1-5-flash-001-2024-05-23"
      | "google/gemini-1-5-flash-002-2024-09-24"
      | "google/gemini-1-5-flash-8b-2024-03-15"
      | "google/gemini-1-5-flash-8b-exp-2024-08-27"
      | "google/gemini-1-5-flash-8b-exp-2024-09-24"
      | "google/gemini-1-5-flash-preview-2024-05-14"
      | "google/gemini-1-5-pro-001-2024-05-23"
      | "google/gemini-1-5-pro-002-2024-09-24"
      | "google/gemini-1-5-pro-exp-2024-08-01"
      | "google/gemini-1-5-pro-exp-2024-08-27"
      | "google/gemini-2-0-flash-2025-02-05"
      | "google/gemini-2-0-flash-exp"
      | "google/gemini-2-0-flash-exp-image-generation"
      | "google/gemini-2-0-flash-lite-2025-02-05"
      | "google/gemini-2-0-flash-live-001-2025-04-09"
      | "google/gemini-2-0-flash-preview-image-generation-2025-05-07"
      | "google/gemini-2-0-flash-thinking-exp-2024-12-19"
      | "google/gemini-2-0-flash-thinking-exp-2025-01-21"
      | "google/gemini-2-0-pro-exp-2025-02-05"
      | "google/gemini-2-5-computer-use-preview-2025-10-07"
      | "google/gemini-2-5-flash-exp-native-audio-thinking-dialog"
      | "google/gemini-2-5-flash-image-2025-10-02"
      | "google/gemini-2-5-flash-image-preview-2025-08-25"
      | "google/gemini-2-5-flash-lite-preview-2025-06-17"
      | "google/gemini-2-5-flash-lite-preview-2025-09-25"
      | "google/gemini-2-5-flash-native-audio-preview"
      | "google/gemini-2-5-flash-preview-2025-04-17"
      | "google/gemini-2-5-flash-preview-2025-05-20"
      | "google/gemini-2-5-flash-preview-2025-09-25"
      | "google/gemini-2-5-flash-preview-native-audio-dialog"
      | "google/gemini-2-5-flash-preview-tts"
      | "google/gemini-2-5-flash-preview-tts-2025-12-10"
      | "google/gemini-2-5-pro-experimental-2025-03-25"
      | "google/gemini-2-5-pro-preview-2025-05-06"
      | "google/gemini-2-5-pro-preview-2025-06-05"
      | "google/gemini-2-5-pro-preview-tts"
      | "google/gemini-2-5-pro-preview-tts-2025-12-10"
      | "google/gemini-3-1-flash-image-preview-2026-02-26"
      | "google/gemini-3-1-flash-lite-preview-2026-03-03"
      | "google/gemini-3-1-pro-preview-2026-02-19"
      | "google/gemini-3-flash-preview-2025-12-17"
      | "google/gemini-3-pro-image-preview-2025-11-20"
      | "google/gemini-3-pro-preview-2025-11-18"
      | "google/gemini-diffusion"
      | "google/gemini-embedding-001-2025-05-20"
      | "google/gemini-embedding-exp-0307-2025-03-07"
      | "google/gemini-exp-1114-2024-11-14"
      | "google/gemini-exp-1121-2024-11-21"
      | "google/gemini-exp-1206-2024-12-06"
      | "google/gemini-live-2-5-flash-preview-2025-04-09"
      | "google/gemini-robotics-er-1-5-preview-2025-09-25"
      | "google/gemma-1-2b-2024-02-21"
      | "google/gemma-1-7b-2024-02-21"
      | "google/gemma-2-27b-2024-06-27"
      | "google/gemma-2-2b-2024-07-31"
      | "google/gemma-2-9b-2024-06-27"
      | "google/gemma-3-12b-2025-03-12"
      | "google/gemma-3-1b-2025-03-12"
      | "google/gemma-3-27b-2025-03-12"
      | "google/gemma-3-4b-2025-03-12"
      | "google/gemma-3n-e2b-2025-06-25"
      | "google/gemma-3n-e4b-2025-06-25"
      | "google/image-generation-002-2023-08-17"
      | "google/image-generation-005-2023-11-22"
      | "google/image-generation-006-2024-03-27"
      | "google/image-text-2023-06-07"
      | "google/imagen-3-0-generate-001-2024-07-31"
      | "google/imagen-3-0-generate-002-2025-01-29"
      | "google/imagen-4-0-fast-generate-001-2025-08-14"
      | "google/imagen-4-0-fast-generate-preview-2025-06-11"
      | "google/imagen-4-0-generate-001-2025-08-14"
      | "google/imagen-4-0-generate-preview-2025-06-11"
      | "google/imagen-4-0-preview-2025-05-20"
      | "google/imagen-4-0-ultra-generate-001-2025-08-14"
      | "google/imagen-4-0-ultra-generate-preview-2025-06-11"
      | "google/imagen-4-0-ultra-preview-2025-05-20"
      | "google/learnlm-1-5-pro-experimental-2024-11-19"
      | "google/learnlm-2-0-flash-experimental-2025-04-17"
      | "google/lyria-1"
      | "google/lyria-2"
      | "google/lyria-3-2026-02-18"
      | "google/medgemma-1-5-4b-2026-01-13"
      | "google/multimodal-embedding-001-2024-02-12"
      | "google/text-bison-2023-05-01"
      | "google/text-embedding-004-2024-05-14"
      | "google/text-embedding-005-2024-11-18"
      | "google/text-embedding-gecko-001-2023-06-07"
      | "google/text-embedding-gecko-002-2023-11-02"
      | "google/text-embedding-gecko-003-2023-12-12"
      | "google/text-embedding-gecko-multilingual-001-2023-11-02"
      | "google/text-multilingual-embedding-002-2024-05-14"
      | "google/translategemma-12b-2026-01-15"
      | "google/translategemma-27b-2026-01-15"
      | "google/translategemma-4b-2026-01-15"
      | "google/veo-2-2025-04-09"
      | "google/veo-3-0-fast-generate-preview-2025-07-17"
      | "google/veo-3-0-generate-preview-2025-07-17"
      | "google/veo-3-1-fast-preview-2025-10-15"
      | "google/veo-3-1-preview-2025-10-15"
      | "google/veo-3-2"
      | "google/veo-3-2025-09-09"
      | "google/veo-3-fast-2025-09-09"
      | "google/veo-4"
      | "ibm/granite-20b-code-instruct-8k"
      | "ibm/granite-3-0-1b-a400m-instruct"
      | "ibm/granite-3-0-2b-instruct"
      | "ibm/granite-3-0-3b-a800m-instruct"
      | "ibm/granite-3-0-8b-instruct"
      | "ibm/granite-3-1-1b-a400m-instruct"
      | "ibm/granite-3-1-2b-instruct"
      | "ibm/granite-3-1-3b-a800m-instruct"
      | "ibm/granite-3-1-8b-instruct"
      | "ibm/granite-3-2-2b-instruct"
      | "ibm/granite-3-2-8b-instruct"
      | "ibm/granite-3-2-8b-instruct-preview"
      | "ibm/granite-3-3-2b-instruct-2025-04-16"
      | "ibm/granite-3-3-8b-instruct-2025-04-16"
      | "ibm/granite-34b-code-instruct-8b"
      | "ibm/granite-3b-code-instruct-128k"
      | "ibm/granite-3b-code-instruct-2k"
      | "ibm/granite-4-0-micro-2025-10-02"
      | "ibm/granite-4-0-small-2025-10-02"
      | "ibm/granite-4-0-tiny-2025-10-02"
      | "ibm/granite-4-0-tiny-preview-2025-05-02"
      | "ibm/granite-8b-code-instruct-128k"
      | "ibm/granite-8b-code-instruct-4k"
      | "ibm/granite-embedding-107m-multilingual"
      | "ibm/granite-embedding-125m-english"
      | "ibm/granite-embedding-278m-multilingual"
      | "ibm/granite-embedding-30m-english"
      | "ibm/granite-embedding-english-r2"
      | "ibm/granite-embedding-reranker-english-r2"
      | "ibm/granite-embedding-small-english-r2"
      | "ibm/granite-guardian-3-0-2b"
      | "ibm/granite-guardian-3-0-8b"
      | "ibm/granite-guardian-3-1-2b"
      | "ibm/granite-guardian-3-1-8b"
      | "ibm/granite-guardian-3-2-5b"
      | "ibm/granite-guardian-3-3-8b"
      | "ibm/granite-speech-3-2-8b"
      | "ibm/granite-speech-3-3-2b"
      | "ibm/granite-speech-3-3-8b"
      | "ibm/granite-vision-3-1-2b-preview"
      | "ibm/granite-vision-3-2-2b"
      | "ibm/granite-vision-3-3-2b"
      | "ibm/granite-vision-3-3-2b-embedding"
      | "inception/mercury-2-2026-02-24"
      | "inclusionai/ring-1t-2-5-2026-02-12"
      | "lg/exaone-3-0-2024-08-07"
      | "lg/exaone-3-5-2-4b-2024-12-09"
      | "lg/exaone-3-5-32b-2024-12-09"
      | "lg/exaone-3-5-7-8b-2024-12-09"
      | "lg/exaone-4-0-1-2b-2025-07-15"
      | "lg/exaone-4-0-32b-2025-07-15"
      | "lg/exaone-deep-2-4b-2025-03-18"
      | "lg/exaone-deep-32b-2025-03-18"
      | "lg/exaone-deep-7-8b-2025-03-18"
      | "lg/k-exaone-2025-12-31"
      | "liquid-ai/lfm-2-1-2b-2025-07-10"
      | "liquid-ai/lfm-2-2-6b-2025-09-23"
      | "liquid-ai/lfm-2-24b-a2b-2026-02-24"
      | "liquid-ai/lfm-2-350m-2025-07-10"
      | "liquid-ai/lfm-2-5-1-2b-2026-01-06"
      | "liquid-ai/lfm-2-5-1-2b-jp-2026-01-06"
      | "liquid-ai/lfm-2-5-1-2b-thinking-2026-01-20"
      | "liquid-ai/lfm-2-5-audio-1-5b"
      | "liquid-ai/lfm-2-5-vl-1-6b"
      | "liquid-ai/lfm-2-700m-2025-07-10"
      | "liquid-ai/lfm-2-8b-a1b-2025-10-07"
      | "meta/llama-2-13b-chat-2023-06-20"
      | "meta/llama-2-70b-chat-2023-06-20"
      | "meta/llama-2-7b-chat"
      | "meta/llama-3-1-405b-instruct-2024-07-23"
      | "meta/llama-3-1-70b-instruct-2024-07-23"
      | "meta/llama-3-1-8b-instruct-2024-07-23"
      | "meta/llama-3-2-11b-vision-instruct"
      | "meta/llama-3-2-1b-instruct-2024-09-25"
      | "meta/llama-3-2-3b-instruct-2024-09-25"
      | "meta/llama-3-2-90b-vision-instruct"
      | "meta/llama-3-3-70b-instruct-2024-12-06"
      | "meta/llama-3-70b-instruct-2024-04-18"
      | "meta/llama-3-8b-instruct-2024-04-18"
      | "meta/llama-4-maverick-2025-04-05"
      | "meta/llama-4-scout-2025-04-05"
      | "microsoft/phi-1"
      | "microsoft/phi-1-5"
      | "microsoft/phi-2"
      | "microsoft/phi-3-5-mini-instruct-2024-08-23"
      | "microsoft/phi-3-5-moe-instruct-2024-08-23"
      | "microsoft/phi-3-5-vision-instruct-2024-08-23"
      | "microsoft/phi-3-medium-128k-instruct"
      | "microsoft/phi-3-medium-4k-instruct"
      | "microsoft/phi-3-mini-128k-instruct"
      | "microsoft/phi-3-small-128k-instruct"
      | "microsoft/phi-3-small-8k-instruct"
      | "microsoft/phi-3-vision-128k-instruct"
      | "microsoft/phi-4-2024-12-12"
      | "microsoft/phi-4-mini-2025-02-01"
      | "microsoft/phi-4-mini-flash-reasoning"
      | "microsoft/phi-4-mini-reasoning-2025-04-30"
      | "microsoft/phi-4-multimodal-instruct-2025-02-01"
      | "microsoft/phi-4-reasoning-2025-04-30"
      | "microsoft/phi-4-reasoning-plus-2025-04-30"
      | "minimax/hailuo-02-2025-06-18"
      | "minimax/hailuo-2-3-2025-10-28"
      | "minimax/hailuo-2-3-fast-2025-10-28"
      | "minimax/i2v-01-director-2025-02-11"
      | "minimax/i2v-01-live"
      | "minimax/image-01-2025-02-15"
      | "minimax/minimax-m1-40k-2025-06-16"
      | "minimax/minimax-m1-80k-2025-06-16"
      | "minimax/minimax-m2-1-2025-12-23"
      | "minimax/minimax-m2-2025-10-27"
      | "minimax/minimax-m2-5-2026-02-12"
      | "minimax/minimax-m2-her-2026-01-24"
      | "minimax/minimax-text-01-2025-01-15"
      | "minimax/minimax-vl-01-2025-01-15"
      | "minimax/music-1-5-2025-06-20"
      | "minimax/music-2-0-2025-10-29"
      | "minimax/music-2-5-2026-01-16"
      | "minimax/s2v-01"
      | "minimax/speech-01-hd"
      | "minimax/speech-01-turbo"
      | "minimax/speech-02-hd-2025-04-02"
      | "minimax/speech-02-turbo-2025-04-02"
      | "minimax/speech-2-5-hd-preview-2025-08-06"
      | "minimax/speech-2-5-turbo-preview-2025-08-06"
      | "minimax/speech-2-6-2025-10-29"
      | "minimax/t2v-01-director-2025-02-11"
      | "mistral/codestral-2024-05-29"
      | "mistral/codestral-2025-01-13"
      | "mistral/codestral-2025-07-30"
      | "mistral/codestral-embed-2025-05-28"
      | "mistral/codestral-mamba-7b-2024-07-16"
      | "mistral/devstral-2-0-2025-12-09"
      | "mistral/devstral-medium-1-0-2025-07-10"
      | "mistral/devstral-small-1-0-2025-05-21"
      | "mistral/devstral-small-1-1-2025-07-10"
      | "mistral/devstral-small-2-0-2025-12-09"
      | "mistral/magistral-medium-1-0-2025-06-10"
      | "mistral/magistral-medium-1-1-2025-07-24"
      | "mistral/magistral-medium-1-2-2025-09-17"
      | "mistral/magistral-small-1-0-2025-06-10"
      | "mistral/magistral-small-1-1-2025-07-24"
      | "mistral/magistral-small-1-2-2025-09-17"
      | "mistral/mathstral-7b-2024-07-16"
      | "mistral/ministral-3-0-14b-2025-12-02"
      | "mistral/ministral-3-0-3b-2025-12-02"
      | "mistral/ministral-3-0-8b-2025-12-02"
      | "mistral/ministral-3b-2024-10-09"
      | "mistral/ministral-8b-2024-10-09"
      | "mistral/mistral-7b-2023-09-27"
      | "mistral/mistral-7b-2023-12-11"
      | "mistral/mistral-7b-2024-05-22"
      | "mistral/mistral-embed-2023-12-11"
      | "mistral/mistral-large-1-0-2024-02-26"
      | "mistral/mistral-large-2-0-2024-07-24"
      | "mistral/mistral-large-2-1-2024-11-18"
      | "mistral/mistral-large-3-0-2025-12-02"
      | "mistral/mistral-medium-1-0-2023-12-11"
      | "mistral/mistral-medium-3-0-2025-05-07"
      | "mistral/mistral-medium-3-1-2025-08-12"
      | "mistral/mistral-moderation-2024-11-06"
      | "mistral/mistral-nemo-12b-2024-07-18"
      | "mistral/mistral-ocr-2-2025-05-22"
      | "mistral/mistral-ocr-2025-03-06"
      | "mistral/mistral-saba-2025-02-17"
      | "mistral/mistral-small-1-0-2024-02-26"
      | "mistral/mistral-small-2-0-2024-09-17"
      | "mistral/mistral-small-3-0-2025-01-30"
      | "mistral/mistral-small-3-1-2025-03-17"
      | "mistral/mistral-small-3-2-2025-06-20"
      | "mistral/mistral-small-creative-2025-12-16"
      | "mistral/mixtral-8x22b-2024-04-17"
      | "mistral/mixtral-8x7b-2023-12-11"
      | "mistral/ocr-3-2025-12-18"
      | "mistral/pixtral-12b-2024-09-17"
      | "mistral/pixtral-large-2024-11-18"
      | "mistral/voxtral-mini-2025-07-15"
      | "mistral/voxtral-mini-transcribe-2-2026-02-04"
      | "mistral/voxtral-mini-transcribe-2025-07-15"
      | "mistral/voxtral-small-2025-07-15"
      | "moonshot-ai/kimi-k1-5-2025-01-20"
      | "moonshot-ai/kimi-k2-2025-07-11"
      | "moonshot-ai/kimi-k2-2025-09-05"
      | "moonshot-ai/kimi-k2-5-2026-01-27"
      | "moonshot-ai/kimi-k2-thinking-2025-11-06"
      | "moonshot-ai/kimi-linear-48b-2025-10-30"
      | "moonshot-ai/kimi-vl-a3b-2025-04-09"
      | "moonshot-ai/kimi-vl-a3b-thinking-2025-04-09"
      | "moonshot-ai/kimi-vl-a3b-thinking-2025-06-21"
      | "naver-hyperclova/hyperclova-x-seed-omni-8b-2025-12-29"
      | "naver-hyperclova/hyperclova-x-seed-think-14b-2025-07-22"
      | "naver-hyperclova/hyperclova-x-seed-think-32b-2025-12-29"
      | "nous/hermes-2-llama-2-70b-2024-02-12"
      | "nous/hermes-2-pro-llama-3-70b-2024-06-27"
      | "nous/hermes-2-pro-llama-3-8b-2024-05-01"
      | "nous/hermes-2-pro-mistral-7b-2024-03-13"
      | "nous/hermes-2-theta-llama-3-70b-2024-06-20"
      | "nous/hermes-2-theta-llama-3-8b-2024-05-15"
      | "nous/hermes-3-llama-3-1-405b-2024-08-15"
      | "nous/hermes-3-llama-3-1-70b-2024-08-15"
      | "nous/hermes-3-llama-3-1-8b-2024-08-15"
      | "nous/hermes-3-llama-3-2-3b-2024-12-11"
      | "nous/hermes-4-14b-2025-07-26"
      | "nous/hermes-4-3-36b-2025-12-03"
      | "nous/hermes-4-405b-2025-07-26"
      | "nous/hermes-4-70b-2025-07-26"
      | "nous/nomos-1-2025-12-09"
      | "nous/nouscoder-14b-2026-01-06"
      | "nvidia/llama-3-1-nemotron-70b-instruct-2024-10-01"
      | "nvidia/llama-3-1-nemotron-nano-4b-v1-1"
      | "nvidia/llama-3-1-nemotron-nano-8b-v1-2025-03-18"
      | "nvidia/llama-3-1-nemotron-ultra-253b-v1-2025-04-07"
      | "nvidia/llama-3-3-nemotron-super-49b-v1-2025-03-18"
      | "nvidia/llama-3-3-nemotron-super-49b-v1-5"
      | "nvidia/nemotron-nano-3-30b-a3b-2025-12-15"
      | "nvidia/nvidia-nemotron-nano-12b-v2"
      | "nvidia/nvidia-nemotron-nano-9b-v2"
      | "nvidia/openreasoning-nemotron-1-5b"
      | "nvidia/openreasoning-nemotron-14b"
      | "nvidia/openreasoning-nemotron-32b"
      | "nvidia/openreasoning-nemotron-7b"
      | "openai/ada-2020-06-11"
      | "openai/babbage-002-2023-08-22"
      | "openai/babbage-2020-06-11"
      | "openai/chatgpt-4o-2024-05-13"
      | "openai/chatgpt-image-latest-2025-12-16"
      | "openai/code-cushman-001"
      | "openai/code-cushman-002"
      | "openai/code-davinci-001"
      | "openai/code-davinci-002"
      | "openai/code-davinci-edit-001"
      | "openai/code-search-ada-code-001"
      | "openai/code-search-ada-text-001"
      | "openai/code-search-babbage-code-001"
      | "openai/code-search-babbage-text-001"
      | "openai/codex-mini-2025-05-16"
      | "openai/computer-use-preview-2025-03-11"
      | "openai/curie-2020-06-11"
      | "openai/dall-e-2-2022-09-28"
      | "openai/dall-e-2021-01-05"
      | "openai/dall-e-3-2023-10-19"
      | "openai/davinci-002-2023-08-22"
      | "openai/davinci-2020-06-11"
      | "openai/gpt-1-2018-06-11"
      | "openai/gpt-2-2019-11-05"
      | "openai/gpt-3-2020-06-11"
      | "openai/gpt-3-5-turbo-0613"
      | "openai/gpt-3-5-turbo-16k-0613-2023-06-13"
      | "openai/gpt-3-5-turbo-2023-03-21"
      | "openai/gpt-3-5-turbo-2023-09-28"
      | "openai/gpt-3-5-turbo-2023-11-06"
      | "openai/gpt-4-1-2025-04-14"
      | "openai/gpt-4-1-mini-2025-04-14"
      | "openai/gpt-4-1-nano-2025-04-14"
      | "openai/gpt-4-2023-03-14"
      | "openai/gpt-4-2023-06-13"
      | "openai/gpt-4-32k"
      | "openai/gpt-4-32k-0314"
      | "openai/gpt-4-32k-0613"
      | "openai/gpt-4-5-2025-02-27"
      | "openai/gpt-4-turbo-2023-03-14"
      | "openai/gpt-4-turbo-2023-11-06"
      | "openai/gpt-4-turbo-2024-01-25"
      | "openai/gpt-4o-2024-05-13"
      | "openai/gpt-4o-2024-08-06"
      | "openai/gpt-4o-2024-11-20"
      | "openai/gpt-4o-audio-2024-10-01"
      | "openai/gpt-4o-audio-2024-12-17"
      | "openai/gpt-4o-audio-2025-06-03"
      | "openai/gpt-4o-mini-2024-07-18"
      | "openai/gpt-4o-mini-audio-preview-2024-12-17"
      | "openai/gpt-4o-mini-realtime-preview-2024-12-17"
      | "openai/gpt-4o-mini-search-preview-2025-03-11"
      | "openai/gpt-4o-mini-transcribe-2025-03-20"
      | "openai/gpt-4o-mini-transcribe-2025-12-15"
      | "openai/gpt-4o-mini-tts-2025-03-20"
      | "openai/gpt-4o-mini-tts-2025-12-15"
      | "openai/gpt-4o-realtime-preview-2024-10-01"
      | "openai/gpt-4o-realtime-preview-2024-12-17"
      | "openai/gpt-4o-realtime-preview-2025-06-03"
      | "openai/gpt-4o-search-preview-2025-03-11"
      | "openai/gpt-4o-transcribe-2025-03-20"
      | "openai/gpt-4o-transcribe-diarize-2025-10-15"
      | "openai/gpt-5-1-2025-11-12"
      | "openai/gpt-5-1-chat-2025-11-13"
      | "openai/gpt-5-1-codex-2025-11-13"
      | "openai/gpt-5-1-codex-max-2025-11-19"
      | "openai/gpt-5-1-codex-mini-2025-11-13"
      | "openai/gpt-5-1-pro"
      | "openai/gpt-5-2-2025-12-11"
      | "openai/gpt-5-2-chat-2025-12-11"
      | "openai/gpt-5-2-codex-2025-12-18"
      | "openai/gpt-5-2-mini"
      | "openai/gpt-5-2-pro-2025-12-11"
      | "openai/gpt-5-2025-08-07"
      | "openai/gpt-5-3-chat-2026-03-03"
      | "openai/gpt-5-3-codex-2026-02-05"
      | "openai/gpt-5-3-codex-spark-2026-02-12"
      | "openai/gpt-5-4"
      | "openai/gpt-5-chat-2025-08-07"
      | "openai/gpt-5-codex-2025-09-15"
      | "openai/gpt-5-codex-mini-2025-11-07"
      | "openai/gpt-5-mini-2025-08-07"
      | "openai/gpt-5-nano-2025-08-07"
      | "openai/gpt-5-pro-2025-08-07"
      | "openai/gpt-5-search-api-2025-10-14"
      | "openai/gpt-audio-1-5-2026-02-23"
      | "openai/gpt-audio-2025-08-28"
      | "openai/gpt-audio-mini-2025-10-06"
      | "openai/gpt-audio-mini-2025-12-15"
      | "openai/gpt-image-1-2025-04-23"
      | "openai/gpt-image-1-5-2025-12-16"
      | "openai/gpt-image-1-mini-2025-10-06"
      | "openai/gpt-oss-120b-2025-08-05"
      | "openai/gpt-oss-20b-2025-08-05"
      | "openai/gpt-oss-safeguard-120b-2025-10-29"
      | "openai/gpt-oss-safeguard-20b-2025-10-29"
      | "openai/gpt-realtime-1-5-2026-02-23"
      | "openai/gpt-realtime-2025-08-28"
      | "openai/gpt-realtime-mini-2025-10-06"
      | "openai/gpt-realtime-mini-2025-12-15"
      | "openai/o1-2024-12-17"
      | "openai/o1-mini-2024-09-12"
      | "openai/o1-preview-2024-09-12"
      | "openai/o1-pro-2025-03-19"
      | "openai/o3-2025-04-16"
      | "openai/o3-deep-research-2025-06-26"
      | "openai/o3-mini-2025-01-30"
      | "openai/o3-preview"
      | "openai/o3-pro-2025-06-10"
      | "openai/o4-mini-2025-04-16"
      | "openai/o4-mini-deep-research-2025-06-26"
      | "openai/omni-moderation-2024-09-26"
      | "openai/sora-1-2024-12-09"
      | "openai/sora-2-2025-09-30"
      | "openai/sora-2-2025-12-08"
      | "openai/sora-2-pro-2025-10-03"
      | "openai/text-ada-001"
      | "openai/text-babbage-001"
      | "openai/text-curie-001"
      | "openai/text-davinci-001"
      | "openai/text-davinci-002"
      | "openai/text-davinci-003"
      | "openai/text-davinci-edit-001"
      | "openai/text-embedding-3-large-2024-01-25"
      | "openai/text-embedding-3-small-2024-01-25"
      | "openai/text-embedding-ada-002-2022-12-15"
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
      | "openai/tts-1-2023-11-06"
      | "openai/tts-1-hd-2023-11-06"
      | "openai/whisper-1-2023-03-01"
      | "prime-intellect/intellect-3-1-2026-02-18"
      | "prime-intellect/intellect-3-2025-11-26"
      | "qwen/code-qwen-1-5-7b"
      | "qwen/qvq-72b-preview"
      | "qwen/qwen-1-5-0-5b"
      | "qwen/qwen-1-5-1-8b"
      | "qwen/qwen-1-5-110b"
      | "qwen/qwen-1-5-14b"
      | "qwen/qwen-1-5-32b"
      | "qwen/qwen-1-5-4b"
      | "qwen/qwen-1-5-72b"
      | "qwen/qwen-1-5-7b"
      | "qwen/qwen-1-5-moe-a2-7b"
      | "qwen/qwen-1-8b"
      | "qwen/qwen-14b"
      | "qwen/qwen-2-0-5b"
      | "qwen/qwen-2-1-5b"
      | "qwen/qwen-2-5-0-5b"
      | "qwen/qwen-2-5-1-5b"
      | "qwen/qwen-2-5-14b"
      | "qwen/qwen-2-5-32b"
      | "qwen/qwen-2-5-3b"
      | "qwen/qwen-2-5-72b"
      | "qwen/qwen-2-5-7b"
      | "qwen/qwen-2-5-coder-0-5b"
      | "qwen/qwen-2-5-coder-1-5b"
      | "qwen/qwen-2-5-coder-14b"
      | "qwen/qwen-2-5-coder-32b-instruct"
      | "qwen/qwen-2-5-coder-3b"
      | "qwen/qwen-2-5-coder-7b"
      | "qwen/qwen-2-5-math-1-5b"
      | "qwen/qwen-2-5-math-72b"
      | "qwen/qwen-2-5-math-7b"
      | "qwen/qwen-2-5-math-7b-prm800k"
      | "qwen/qwen-2-5-math-prm-72b"
      | "qwen/qwen-2-5-math-prm-7b"
      | "qwen/qwen-2-5-math-rm-72b"
      | "qwen/qwen-2-5-omni-3b"
      | "qwen/qwen-2-5-omni-7b"
      | "qwen/qwen-2-5-vl-32b-instruct"
      | "qwen/qwen-2-5-vl-3b-instruct"
      | "qwen/qwen-2-5-vl-72b-instruct"
      | "qwen/qwen-2-5-vl-7b-instruct"
      | "qwen/qwen-2-72b-instruct"
      | "qwen/qwen-2-7b-instruct"
      | "qwen/qwen-2-audio-7b"
      | "qwen/qwen-2-math-1-5b"
      | "qwen/qwen-2-math-72b"
      | "qwen/qwen-2-math-7b"
      | "qwen/qwen-2-math-rm-72b"
      | "qwen/qwen-2-vl-2b"
      | "qwen/qwen-2-vl-72b"
      | "qwen/qwen-2-vl-7b"
      | "qwen/qwen-3-0-6b"
      | "qwen/qwen-3-1-7b"
      | "qwen/qwen-3-14b"
      | "qwen/qwen-3-235b-a22b"
      | "qwen/qwen-3-235b-a22b-thinking-2507"
      | "qwen/qwen-3-30b-a3b"
      | "qwen/qwen-3-30b-a3b-instruct-2507"
      | "qwen/qwen-3-30b-a3b-thinking-2507"
      | "qwen/qwen-3-32b"
      | "qwen/qwen-3-4b"
      | "qwen/qwen-3-4b-instruct-2507"
      | "qwen/qwen-3-4b-saferl"
      | "qwen/qwen-3-4b-thinking-2507"
      | "qwen/qwen-3-5-0-8b-2026-03-02"
      | "qwen/qwen-3-5-122b-a10b-2026-02-24"
      | "qwen/qwen-3-5-27b-2026-02-24"
      | "qwen/qwen-3-5-2b-2026-03-02"
      | "qwen/qwen-3-5-35b-a3b-2026-02-24"
      | "qwen/qwen-3-5-397b-a17b-2026-02-16"
      | "qwen/qwen-3-5-4b-2026-03-02"
      | "qwen/qwen-3-5-9b-2026-03-02"
      | "qwen/qwen-3-5-flash-2026-02-23"
      | "qwen/qwen-3-5-plus-2026-02-16"
      | "qwen/qwen-3-8b"
      | "qwen/qwen-3-a235-a22b-instruct-2507"
      | "qwen/qwen-3-asr-0-6b"
      | "qwen/qwen-3-asr-1-7b"
      | "qwen/qwen-3-coder-30b-a3b-instruct"
      | "qwen/qwen-3-coder-480b-a35b-instruct"
      | "qwen/qwen-3-coder-next"
      | "qwen/qwen-3-embedding-0-6b"
      | "qwen/qwen-3-embedding-4b"
      | "qwen/qwen-3-embedding-8b"
      | "qwen/qwen-3-forcedaligner-0-6b"
      | "qwen/qwen-3-guard-gen-0-6b"
      | "qwen/qwen-3-guard-gen-4b"
      | "qwen/qwen-3-guard-gen-8b"
      | "qwen/qwen-3-guard-stream-0-6b"
      | "qwen/qwen-3-guard-stream-4b"
      | "qwen/qwen-3-guard-stream-8b"
      | "qwen/qwen-3-max-thinking-2026-01-26"
      | "qwen/qwen-3-next-80b-a3b-instruct"
      | "qwen/qwen-3-next-80b-a3b-thinking"
      | "qwen/qwen-3-omni-30b-a3b-captioner"
      | "qwen/qwen-3-omni-30b-a3b-instruct"
      | "qwen/qwen-3-omni-30b-a3b-thinking"
      | "qwen/qwen-3-omni-flash"
      | "qwen/qwen-3-reranker-0-6b"
      | "qwen/qwen-3-reranker-4b"
      | "qwen/qwen-3-reranker-8b"
      | "qwen/qwen-3-tts"
      | "qwen/qwen-3-tts-12hz-0-6b-base"
      | "qwen/qwen-3-tts-12hz-0-6b-customvoice"
      | "qwen/qwen-3-tts-12hz-1-7b-base"
      | "qwen/qwen-3-tts-12hz-1-7b-voicedesign"
      | "qwen/qwen-3-tts-tokenizer-12hz"
      | "qwen/qwen-3-vl-235b-a22b-instruct"
      | "qwen/qwen-3-vl-235b-a22b-thinking"
      | "qwen/qwen-3-vl-2b-instruct"
      | "qwen/qwen-3-vl-2b-thinking"
      | "qwen/qwen-3-vl-30b-a3b-instruct"
      | "qwen/qwen-3-vl-30b-a3b-thinking"
      | "qwen/qwen-3-vl-32b-instruct"
      | "qwen/qwen-3-vl-32b-thinking"
      | "qwen/qwen-3-vl-4b-instruct"
      | "qwen/qwen-3-vl-4b-thinking"
      | "qwen/qwen-3-vl-8b-instruct"
      | "qwen/qwen-3-vl-8b-thinking"
      | "qwen/qwen-3-vl-embedding-2b"
      | "qwen/qwen-3-vl-embedding-8b"
      | "qwen/qwen-3-vl-reranker-2b"
      | "qwen/qwen-3-vl-reranker-8b"
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
      | "suno/suno-v3-5-2024-05-25"
      | "suno/suno-v4-2024-11-19"
      | "suno/suno-v4-5-2025-05-01"
      | "suno/suno-v4-5-all-2025-10-27"
      | "suno/suno-v4-5+-2025-07-17"
      | "suno/suno-v5-2025-09-23"
      | "upstage/solar-pro"
      | "upstage/solar-pro-2-2025-07-10"
      | "upstage/solar-pro-2-2025-09-09"
      | "upstage/solar-pro-2-2025-12-15"
      | "upstage/solar-pro-2-preview-2025-05-20"
      | "upstage/solar-pro-3-2026-01-26"
      | "vercel/v0-1-0-md"
      | "vercel/v0-1-5-lg"
      | "vercel/v0-1-5-md"
      | "vercel/v0-1-5-sm"
      | "x-ai/grok-0"
      | "x-ai/grok-1"
      | "x-ai/grok-1-5-2024-03-28"
      | "x-ai/grok-1-5v-2024-04-12"
      | "x-ai/grok-2-2024-08-13"
      | "x-ai/grok-2-image-1212"
      | "x-ai/grok-2-mini-2024-08-13"
      | "x-ai/grok-2-vision-1212"
      | "x-ai/grok-3-2025-04-18"
      | "x-ai/grok-3-beta-2025-02-19"
      | "x-ai/grok-3-mini-2025-04-18"
      | "x-ai/grok-3-mini-beta-2025-02-19"
      | "x-ai/grok-4-1-non-thinking-2025-11-17"
      | "x-ai/grok-4-1-thinking-2025-11-17"
      | "x-ai/grok-4-2"
      | "x-ai/grok-4-2025-07-10"
      | "x-ai/grok-4-fast-non-reasoning-2025-09-20"
      | "x-ai/grok-4-fast-reasoning-2025-09-20"
      | "x-ai/grok-4-heavy-2025-07-10"
      | "x-ai/grok-code-fast-1-2025-08-28"
      | "x-ai/grok-imagine-image-2026-01-29"
      | "x-ai/grok-imagine-image-pro-2026-01-29"
      | "x-ai/grok-imagine-video-2026-01-29"
      | "xiaomi/mimo-v2-flash-2025-12-16"
      | "z-ai/glm-4-1v-9b-2025-07-02"
      | "z-ai/glm-4-1v-thinking-9b-2025-07-02"
      | "z-ai/glm-4-32b-2025-04-15"
      | "z-ai/glm-4-5-2025-07-28"
      | "z-ai/glm-4-5-air-2025-07-28"
      | "z-ai/glm-4-5-air-x"
      | "z-ai/glm-4-5-x"
      | "z-ai/glm-4-5v-2025-08-11"
      | "z-ai/glm-4-6-2025-09-30"
      | "z-ai/glm-4-6v-2025-12-08"
      | "z-ai/glm-4-6v-flash-2025-12-08"
      | "z-ai/glm-4-7-2025-12-22"
      | "z-ai/glm-4-7-flash-2026-01-19"
      | "z-ai/glm-4-9b-2024-06-04"
      | "z-ai/glm-4-9b-2025-04-14"
      | "z-ai/glm-4-9b-chat-1m-2024-10-24"
      | "z-ai/glm-4-9b-chat-2024-06-04"
      | "z-ai/glm-4v-9b"
      | "z-ai/glm-5-2026-02-11"
      | "z-ai/glm-5-code"
      | "z-ai/glm-image-2026-01-14"[];
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

export type ListModelsParams = {
  path?: Record<string, never>;
  query?: {
    endpoints?: string[];
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
      | "lg"
      | "liquid-ai"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshot-ai"
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
      | "lg"
      | "liquid-ai"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshot-ai"
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
 * Returns models currently servable through the gateway.
 */
export async function listModels(
  client: Client,
  args: ListModelsParams = {},
): Promise<{
  limit?: number;
  models?: {
    aliases?: string[];
    endpoints?: string[];
    input_types?: string[];
    model_id?: string;
    name?: string;
    organisation_id?: string;
    output_types?: string[];
    providers?: {
      api_provider_id?: string;
      params?: string[];
    }[];
    release_date?: string;
    status?: string;
  }[];
  offset?: number;
  ok?: boolean;
  total?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/gateway/models";
  return client.request<{
    limit?: number;
    models?: {
      aliases?: string[];
      endpoints?: string[];
      input_types?: string[];
      model_id?: string;
      name?: string;
      organisation_id?: string;
      output_types?: string[];
      providers?: {
        api_provider_id?: string;
        params?: string[];
      }[];
      release_date?: string;
      status?: string;
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

export type ListProvisioningKeysParams = {
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
export async function listProvisioningKeys(
  client: Client,
  args: ListProvisioningKeysParams = {},
): Promise<{
  keys?: {
    created_at?: string;
    id?: string;
    last_used_at?: string | null;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
  }[];
  limit?: number;
  offset?: number;
  ok?: boolean;
  total?: number;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/management/keys";
  return client.request<{
    keys?: {
      created_at?: string;
      id?: string;
      last_used_at?: string | null;
      name?: string;
      prefix?: string;
      scopes?: string;
      status?: "active" | "disabled" | "revoked";
    }[];
    limit?: number;
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

export type ListProvisioningKeysAliasParams = {
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
 * Alias of management keys endpoint.
 */
export async function listProvisioningKeysAlias(
  client: Client,
  args: ListProvisioningKeysAliasParams = {},
): Promise<{
  keys?: {
    created_at?: string;
    id?: string;
    last_used_at?: string | null;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
  }[];
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/provisioning/keys";
  return client.request<{
    keys?: {
      created_at?: string;
      id?: string;
      last_used_at?: string | null;
      name?: string;
      prefix?: string;
      scopes?: string;
      status?: "active" | "disabled" | "revoked";
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

export type ListProvisioningKeysLegacyParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Legacy alias of /management/keys.
 */
export async function listProvisioningKeysLegacy(
  client: Client,
  args: ListProvisioningKeysLegacyParams = {},
): Promise<{
  keys?: {
    created_at?: string;
    id?: string;
    last_used_at?: string | null;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
  }[];
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/keys";
  return client.request<{
    keys?: {
      created_at?: string;
      id?: string;
      last_used_at?: string | null;
      name?: string;
      prefix?: string;
      scopes?: string;
      status?: "active" | "disabled" | "revoked";
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

export type UpdateProvisioningKeyParams = {
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
export async function updateProvisioningKey(
  client: Client,
  args: UpdateProvisioningKeyParams = {},
): Promise<{
  message?: string;
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/management/keys/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
    message?: string;
    ok?: boolean;
  }>({
    method: "PATCH",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type UpdateProvisioningKeyAliasParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    [key: string]: unknown;
  };
};

/**
 * Alias of management key update endpoint.
 */
export async function updateProvisioningKeyAlias(
  client: Client,
  args: UpdateProvisioningKeyAliasParams = {},
): Promise<{
  [key: string]: unknown;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/provisioning/keys/${encodeURIComponent(String(path?.id))}`;
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

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
    model: string;
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
    };
    stream?: boolean;
    system?: string | {}[];
    temperature?: number;
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
 * Creates a batch of API requests.
 */
export async function createBatch(
  client: Client,
  args: CreateBatchParams = {},
): Promise<{
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
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batches";
  return client.request<{
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
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    status?: string;
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
 * Alias of /batches.
 */
export async function createBatchAlias(
  client: Client,
  args: CreateBatchAliasParams = {},
): Promise<{
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
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/batch";
  return client.request<{
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
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    status?: string;
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
    frequency_penalty?: number;
    logit_bias?: {
      [key: string]: number;
    };
    logprobs?: boolean;
    max_output_tokens?: number;
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
      summary?: "auto" | "concise" | "detailed";
    };
    response_format?:
      | string
      | {
          schema?: {};
          type?: string;
        };
    seed?: number;
    service_tier?: "flex" | "standard" | "priority";
    stream?: boolean;
    system?: string;
    temperature?: number;
    tool_choice?: string | {};
    tools?: {
      type?: "function";
    }[];
    top_k?: number;
    top_logprobs?: number;
    top_p?: number;
    usage?: boolean;
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

export type CreateKeyPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Placeholder route; currently returns not implemented.
 */
export async function createKeyPlaceholder(
  client: Client,
  args: CreateKeyPlaceholderParams = {},
): Promise<{
  created_at?: string;
  id?: string;
  key?: string;
  name?: string;
  prefix?: string;
  scopes?: string;
  status?: "active" | "disabled" | "revoked";
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/keys";
  return client.request<{
    created_at?: string;
    id?: string;
    key?: string;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
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
    conversation?: string | {};
    debug?: {
      enabled?: boolean;
      return_upstream_request?: boolean;
      return_upstream_response?: boolean;
      trace?: boolean;
      trace_level?: "summary" | "full";
    };
    include?: string[];
    input?: {};
    input_items?: {}[];
    instructions?: string;
    max_output_tokens?: number;
    max_tool_calls?: number;
    meta?: boolean;
    metadata?: {
      [key: string]: string;
    };
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
    reasoning?: {
      effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
      summary?: string;
    };
    safety_identifier?: string;
    service_tier?: string;
    store?: boolean;
    stream?: boolean;
    stream_options?: {};
    temperature?: number;
    text?: {};
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
    input_reference?: string;
    input_reference_mime_type?: string;
    model: string;
    negative_prompt?: string;
    output_storage_uri?: string;
    person_generation?: string;
    prompt: string;
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
    };
    ratio?: string;
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
    input_reference?: string;
    input_reference_mime_type?: string;
    model: string;
    negative_prompt?: string;
    output_storage_uri?: string;
    person_generation?: string;
    prompt: string;
    provider?: {
      ignore?: string[];
      include_alpha?: boolean;
      only?: string[];
      order?: string[];
    };
    ratio?: string;
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

export type GetKeyPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Placeholder route; currently returns not implemented.
 */
export async function getKeyPlaceholder(
  client: Client,
  args: GetKeyPlaceholderParams = {},
): Promise<{
  key?: {
    created_at?: string;
    id?: string;
    last_used_at?: string | null;
    name?: string;
    prefix?: string;
    scopes?: string;
    status?: "active" | "disabled" | "revoked";
  };
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/key";
  return client.request<{
    key?: {
      created_at?: string;
      id?: string;
      last_used_at?: string | null;
      name?: string;
      prefix?: string;
      scopes?: string;
      status?: "active" | "disabled" | "revoked";
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

export type ListEndpointsPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Placeholder route; currently returns not implemented.
 */
export async function listEndpointsPlaceholder(
  client: Client,
  args: ListEndpointsPlaceholderParams = {},
): Promise<{
  endpoints?: string[];
  ok?: boolean;
  sample_models?:
    | "ai21/jamba-large-1-5-2024-08-22"
    | "ai21/jamba-large-1-6-2025-03-06"
    | "ai21/jamba-large-1-7-2025-07-03"
    | "ai21/jamba-mini-1-5-2024-08-22"
    | "ai21/jamba-mini-1-6-2025-03-06"
    | "ai21/jamba-mini-1-7-2025-07-03"
    | "ai21/jamba-reasoning-3b-2025-10-08"
    | "amazon/nova-2-lite-2025-12-02"
    | "amazon/nova-2-omni-2025-12-02"
    | "amazon/nova-2-pro-2025-12-02"
    | "amazon/nova-2-sonic-2025-12-02"
    | "amazon/nova-canvas"
    | "amazon/nova-lite-1-0-2024-12-04"
    | "amazon/nova-micro-1-0-2024-12-04"
    | "amazon/nova-multimodal-embeddings-2025-12-02"
    | "amazon/nova-premier-2025-04-30"
    | "amazon/nova-pro-1-0-2024-12-04"
    | "amazon/nova-reel"
    | "amazon/nova-sonic"
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
    | "anthropic/claude-sonnet-4-2025-05-21"
    | "anthropic/claude-sonnet-4-5-2025-09-29"
    | "baidu/ernie-4-5-21b-a3b"
    | "baidu/ernie-4-5-21b-a3b-thinking"
    | "baidu/ernie-4-5-300b-a47b"
    | "baidu/ernie-4-5-vl-28b-a3b"
    | "baidu/ernie-4-5-vl-424b-a47b"
    | "baidu/qianfan-vl-3b"
    | "baidu/qianfan-vl-70b"
    | "baidu/qianfan-vl-8b"
    | "bytedance/seed-coder-8b-instruct"
    | "bytedance/seed-coder-8b-reasoning"
    | "bytedance/seed-oss-36b-instruct"
    | "cohere/c4ai-aya-expanse-32b"
    | "cohere/c4ai-aya-expanse-8b"
    | "cohere/c4ai-aya-vision-32b"
    | "cohere/c4ai-aya-vision-8b"
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
    | "cohere/embed-v4"
    | "cohere/rerank-multilingual-v3"
    | "cohere/rerank-v3-5"
    | "cohere/rerenk-english-v3"
    | "deepseek/deepseek-coder-v2-2024-06-14"
    | "deepseek/deepseek-coder-v2-2024-07-24"
    | "deepseek/deepseek-ocr-2025-10-20"
    | "deepseek/deepseek-r1-2025-01-20"
    | "deepseek/deepseek-r1-2025-05-28"
    | "deepseek/deepseek-r1-lite-preview"
    | "deepseek/deepseek-v2-2024-05-17"
    | "deepseek/deepseek-v2-2024-06-28"
    | "deepseek/deepseek-v2-5"
    | "deepseek/deepseek-v2-5-2024-05-08"
    | "deepseek/deepseek-v3-1"
    | "deepseek/deepseek-v3-1-terminus-2025-09-22"
    | "deepseek/deepseek-v3-2-2025-12-01"
    | "deepseek/deepseek-v3-2-exp-2025-09-29"
    | "deepseek/deepseek-v3-2-speciale-2025-12-01"
    | "deepseek/deepseek-v3-2024-12-25"
    | "deepseek/deepseek-v3-2025-03-25"
    | "deepseek/deepseek-vl2-2024-12-13"
    | "deepseek/deepseek-vl2-small-2024-12-13"
    | "deepseek/deepseek-vl2-tiny-2024-12-13"
    | "essential-ai/rnj-1-2025-12-06"
    | "google/chat-bison"
    | "google/code-gecko"
    | "google/embedding-001-2023-12-13"
    | "google/gemini-1-0-nano-2023-12-06"
    | "google/gemini-1-0-pro-2023-12-06"
    | "google/gemini-1-0-pro-vision-001"
    | "google/gemini-1-0-ultra-2023-12-06"
    | "google/gemini-1-5-flash-001-2024-05-23"
    | "google/gemini-1-5-flash-002-2024-09-24"
    | "google/gemini-1-5-flash-8b-2024-03-15"
    | "google/gemini-1-5-flash-8b-exp-2024-08-27"
    | "google/gemini-1-5-flash-8b-exp-2024-09-24"
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
    | "google/gemini-2-5-flash-image-preview"
    | "google/gemini-2-5-flash-lite-preview-2025-06-17"
    | "google/gemini-2-5-flash-lite-preview-2025-09-25"
    | "google/gemini-2-5-flash-native-audio-preview"
    | "google/gemini-2-5-flash-preview-2025-04-17"
    | "google/gemini-2-5-flash-preview-2025-05-20"
    | "google/gemini-2-5-flash-preview-2025-09-25"
    | "google/gemini-2-5-flash-preview-native-audio-dialog"
    | "google/gemini-2-5-flash-preview-tts"
    | "google/gemini-2-5-flash-preview-tts-2025-12-10"
    | "google/gemini-2-5-pro-experimental"
    | "google/gemini-2-5-pro-preview-2025-05-06"
    | "google/gemini-2-5-pro-preview-2025-06-05"
    | "google/gemini-2-5-pro-preview-tts"
    | "google/gemini-2-5-pro-preview-tts-2025-12-10"
    | "google/gemini-3-0-flash"
    | "google/gemini-3-0-flash-lite"
    | "google/gemini-3-0-pro-preview-2025-11-18"
    | "google/gemini-3-flash-image"
    | "google/gemini-3-pro-image-preview-2025-11-20"
    | "google/gemini-diffusion"
    | "google/gemini-embedding-001-2025-05-20"
    | "google/gemini-embedding-exp-0307-2025-03-07"
    | "google/gemini-exp-1114-2024-11-14"
    | "google/gemini-exp-1121-2024-11-21"
    | "google/gemini-exp-1206"
    | "google/gemini-live-2-5-flash-preview-2025-04-09"
    | "google/gemini-robotics-er-1-5-preview"
    | "google/gemma-1-2b-2024-02-21"
    | "google/gemma-1-7b-2024-02-21"
    | "google/gemma-2-27b-2024-06-27"
    | "google/gemma-2-2b-2024-07-31"
    | "google/gemma-2-9b-2024-06-27"
    | "google/gemma-3-12b-2025-03-12"
    | "google/gemma-3-1b-2025-03-12"
    | "google/gemma-3-27b-2025-03-12"
    | "google/gemma-3-4b-2025-03-12"
    | "google/gemma-3n-e2b"
    | "google/gemma-3n-e4b-2025-05-20"
    | "google/image-generation-002"
    | "google/image-generation-005"
    | "google/image-generation-006"
    | "google/image-text"
    | "google/imagen-3-0-generate-001"
    | "google/imagen-3-0-generate-002-2025-02-06"
    | "google/imagen-4-0-fast-generate-001"
    | "google/imagen-4-0-generate-001-2025-08-14"
    | "google/imagen-4-0-ultra-generate-001-2025-08-14"
    | "google/imagen-4-preview"
    | "google/imagen-4-ultra-preview-2025-08-14"
    | "google/learnlm-1-5-pro-experimental"
    | "google/learnlm-2-0-flash-experimental"
    | "google/multimodal-embedding-001"
    | "google/text-bison"
    | "google/text-embedding-004"
    | "google/text-embedding-005"
    | "google/text-embedding-gecko-001-2023-12-13"
    | "google/text-embedding-gecko-002"
    | "google/text-embedding-gecko-003"
    | "google/text-embedding-gecko-multilingual-001"
    | "google/text-multilingual-embedding-002"
    | "google/veo-2-2025-04-09"
    | "google/veo-3-0-fast-generate-preview-2025-07-17"
    | "google/veo-3-0-generate-preview-2025-07-17"
    | "google/veo-3-1-fast-preview-2025-10-15"
    | "google/veo-3-1-preview-2025-10-15"
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
    | "lg/exaone-3-0-2024-08-07"
    | "lg/exaone-3-5-2-4b-2024-12-09"
    | "lg/exaone-3-5-32b-2024-12-09"
    | "lg/exaone-3-5-7-8b-2024-12-09"
    | "lg/exaone-4-0-1-2b-2025-07-15"
    | "lg/exaone-4-0-32b-2025-07-15"
    | "lg/exaone-deep-2-4b-2025-03-18"
    | "lg/exaone-deep-32b-2025-03-18"
    | "lg/exaone-deep-7-8b-2025-03-18"
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
    | "minimax/hailuo-02"
    | "minimax/i2v-01-director"
    | "minimax/i2v-01-live"
    | "minimax/image-01"
    | "minimax/minimax-m1-2025-06-16"
    | "minimax/minimax-m1-40k"
    | "minimax/minimax-m2-1"
    | "minimax/minimax-m2-2025-10-27"
    | "minimax/minimax-text-01"
    | "minimax/minimax-vl-01"
    | "minimax/music-1-5"
    | "minimax/s2v-01"
    | "minimax/speech-01-hd"
    | "minimax/speech-01-turbo"
    | "minimax/speech-02-hd"
    | "minimax/speech-02-turbo"
    | "minimax/speech-2-5-hd-preview"
    | "minimax/speech-2-5-turbo-preview"
    | "minimax/t2v-01-director"
    | "mistral/codestral-22b-2024-05-29"
    | "mistral/codestral-2405"
    | "mistral/codestral-2501"
    | "mistral/codestral-2508"
    | "mistral/codestral-embed"
    | "mistral/devstral-2-2025-12-09"
    | "mistral/devstral-medium-1-1-2025-07-10"
    | "mistral/devstral-small"
    | "mistral/devstral-small-1-1-2025-07-10"
    | "mistral/devstral-small-2-2025-12-09"
    | "mistral/magistral-medium-2025-06-10"
    | "mistral/magistral-medium-2507"
    | "mistral/magistral-medium-2509"
    | "mistral/magistral-small-2025-06-10"
    | "mistral/magistral-small-2507"
    | "mistral/magistral-small-2509"
    | "mistral/mamba-codestral-7b"
    | "mistral/mathstral-7b"
    | "mistral/ministral-3-14b-2025-12-02"
    | "mistral/ministral-3-3b-2025-12-02"
    | "mistral/ministral-3-8b-2025-12-02"
    | "mistral/ministral-3b-2410"
    | "mistral/ministral-8b-2410"
    | "mistral/ministral-8b-instruct-2024-10-16"
    | "mistral/mistral-7b"
    | "mistral/mistral-embed"
    | "mistral/mistral-large-2-2024-07-24"
    | "mistral/mistral-large-2402"
    | "mistral/mistral-large-2407"
    | "mistral/mistral-large-2411"
    | "mistral/mistral-large-3-675b-2025-12-02"
    | "mistral/mistral-medium-2312"
    | "mistral/mistral-medium-2505"
    | "mistral/mistral-medium-2508"
    | "mistral/mistral-moderation-2411"
    | "mistral/mistral-nemo-instruct-2024-07-18"
    | "mistral/mistral-ocr-2503"
    | "mistral/mistral-ocr-2505"
    | "mistral/mistral-saba-2502"
    | "mistral/mistral-small-2024-09-17"
    | "mistral/mistral-small-2402"
    | "mistral/mistral-small-2407"
    | "mistral/mistral-small-2501"
    | "mistral/mistral-small-2503"
    | "mistral/mistral-small-2506"
    | "mistral/mistral-small-3-1-24b-base-2025-03-17"
    | "mistral/mistral-small-3-1-24b-instruct-2025-03-17"
    | "mistral/mistral-small-3-2-2025-06-20"
    | "mistral/mistral-small-3-24b-base-2025-01-30"
    | "mistral/mistral-small-3-24b-instruct-2025-01-30"
    | "mistral/mixtral-8x22b"
    | "mistral/mixtral-8x7b"
    | "mistral/open-codestral-mamba"
    | "mistral/open-mistral-7b"
    | "mistral/open-mistral-nemo"
    | "mistral/open-mixtral-8x22b"
    | "mistral/open-mixtral-8x7b"
    | "mistral/pixtral-12b-base-2024-09-17"
    | "mistral/pixtral-large-2024-11-18"
    | "mistral/pixtral-large-2411"
    | "mistral/voxtral-mini-2507"
    | "mistral/voxtral-small-2507"
    | "moonshotai/kimi-k1-5-2025-01-20"
    | "moonshotai/kimi-k2-base-2025-07-11"
    | "moonshotai/kimi-k2-instruct-0905"
    | "moonshotai/kimi-k2-instruct-2025-07-11"
    | "moonshotai/kimi-k2-thinking-2025-11-06"
    | "moonshotai/kimi-vl-a3b-instruct"
    | "moonshotai/kimi-vl-a3b-thinking"
    | "moonshotai/kimi-vl-a3b-thinking-2506"
    | "nous/hermes-2-pro-llama-3-70b"
    | "nous/hermes-2-pro-llama-3-8b"
    | "nous/hermes-2-pro-mistral-7b"
    | "nous/hermes-2-theta-llama-3-70b"
    | "nous/hermes-2-theta-llama-3-8b"
    | "nous/hermes-3-llama-3-1-405b"
    | "nous/hermes-3-llama-3-1-70b"
    | "nous/hermes-3-llama-3-1-8b"
    | "nous/hermes-3-llama-3-2-3b"
    | "nous/hermes-4-14b"
    | "nous/hermes-4-3-36b-2025-12-03"
    | "nous/hermes-4-405b"
    | "nous/hermes-4-70b"
    | "nous/nomos-1-2025-12-09"
    | "nvidia/llama-3-1-nemotron-70b-instruct-2024-10-01"
    | "nvidia/llama-3-1-nemotron-nano-4b-v1-1"
    | "nvidia/llama-3-1-nemotron-nano-8b-v1-2025-03-18"
    | "nvidia/llama-3-1-nemotron-ultra-253b-v1-2025-04-07"
    | "nvidia/llama-3-3-nemotron-super-49b-v1-2025-03-18"
    | "nvidia/llama-3-3-nemotron-super-49b-v1-5"
    | "nvidia/nemotron-nano-3-30b-a3b"
    | "nvidia/nvidia-nemotron-nano-12b-v2"
    | "nvidia/nvidia-nemotron-nano-9b-v2"
    | "nvidia/openreasoning-nemotron-1-5b"
    | "nvidia/openreasoning-nemotron-14b"
    | "nvidia/openreasoning-nemotron-32b"
    | "nvidia/openreasoning-nemotron-7b"
    | "openai/ada-2020-06-11"
    | "openai/babbage-002"
    | "openai/babbage-2020-06-11"
    | "openai/chatgpt-4o"
    | "openai/code-cushman-001"
    | "openai/code-cushman-002"
    | "openai/code-davinci-001"
    | "openai/code-davinci-002"
    | "openai/code-davinci-edit-001"
    | "openai/code-search-ada-code-001"
    | "openai/code-search-babbage-code-001"
    | "openai/code-search-babbage-text-001"
    | "openai/codes-search-ada-text-001"
    | "openai/codex-mini-2025-05-16"
    | "openai/computer-use-preview"
    | "openai/curie-2020-06-11"
    | "openai/dall-e-2-2022-09-28"
    | "openai/dall-e-3-2023-10-19"
    | "openai/davinci-002"
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
    | "openai/gpt-4o-mini-audio-preview"
    | "openai/gpt-4o-mini-realtime-preview"
    | "openai/gpt-4o-mini-search-preview"
    | "openai/gpt-4o-mini-transcribe"
    | "openai/gpt-4o-mini-tts"
    | "openai/gpt-4o-realtime-preview-2024-10-01"
    | "openai/gpt-4o-realtime-preview-2024-12-17"
    | "openai/gpt-4o-realtime-preview-2025-06-03"
    | "openai/gpt-4o-search-preview"
    | "openai/gpt-4o-transcribe"
    | "openai/gpt-4o-transcribe-diarize-2025-10-15"
    | "openai/gpt-5-1-2025-11-12"
    | "openai/gpt-5-1-chat-2025-11-13"
    | "openai/gpt-5-1-codex-2025-11-13"
    | "openai/gpt-5-1-codex-max-2025-11-19"
    | "openai/gpt-5-1-codex-mini-2025-11-13"
    | "openai/gpt-5-1-pro"
    | "openai/gpt-5-2-2025-12-11"
    | "openai/gpt-5-2-chat-2025-12-11"
    | "openai/gpt-5-2-pro-2025-12-11"
    | "openai/gpt-5-2025-08-07"
    | "openai/gpt-5-chat-2025-08-07"
    | "openai/gpt-5-codex-2025-09-15"
    | "openai/gpt-5-codex-mini-2025-11-07"
    | "openai/gpt-5-mini-2025-08-07"
    | "openai/gpt-5-nano-2025-08-07"
    | "openai/gpt-5-pro-2025-08-07"
    | "openai/gpt-5-search-api-2025-10-14"
    | "openai/gpt-6"
    | "openai/gpt-6-mini"
    | "openai/gpt-6-nano"
    | "openai/gpt-6-pro"
    | "openai/gpt-audio"
    | "openai/gpt-audio-mini-2025-10-06"
    | "openai/gpt-image-1"
    | "openai/gpt-image-1-mini-2025-10-06"
    | "openai/gpt-oss-120b-2025-08-05"
    | "openai/gpt-oss-20b-2025-08-05"
    | "openai/gpt-oss-safeguard-120b-2025-10-29"
    | "openai/gpt-oss-safeguard-20b-2025-10-29"
    | "openai/gpt-realtime"
    | "openai/gpt-realtime-mini-2025-10-06"
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
    | "openai/sora-2-pro-2025-10-03"
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
    | "qwen/qvq-72b-preview-2024-12-25"
    | "qwen/qwen-3-omni-flash-2025-12-08"
    | "qwen/qwen-3-tts-2025-12-05"
    | "qwen/qwen2-5-14b-instruct-2024-09-19"
    | "qwen/qwen2-5-32b-instruct-2024-09-19"
    | "qwen/qwen2-5-72b-instruct-2024-09-19"
    | "qwen/qwen2-5-7b-instruct-2024-09-19"
    | "qwen/qwen2-5-coder-32b-instruct-2024-09-19"
    | "qwen/qwen2-5-coder-7b-instruct-2024-09-19"
    | "qwen/qwen2-5-omni-7b-2025-03-27"
    | "qwen/qwen2-5-vl-32b-instruct-2025-02-28"
    | "qwen/qwen2-5-vl-72b-instruct-2025-01-26"
    | "qwen/qwen2-5-vl-7b-instruct-2025-01-26"
    | "qwen/qwen2-72b-instruct-2024-07-23"
    | "qwen/qwen2-7b-instruct-2024-07-23"
    | "qwen/qwen2-vl-72b-instruct-2024-08-29"
    | "qwen/qwen3-235b-a22b-2025-04-29"
    | "qwen/qwen3-235b-a22b-thinking-2507-2025-07-25"
    | "qwen/qwen3-30b-a3b-2025-04-29"
    | "qwen/qwen3-32b-2025-04-29"
    | "qwen/qwen3-a235-a22b-instruct-2507-2025-07-21"
    | "qwen/qwen3-coder-480b-a35b-instruct-2025-07-22"
    | "qwen/qwq-32b-2025-03-05"
    | "qwen/qwq-32b-preview-2024-11-28"
    | "suno/suno-v3-5"
    | "suno/suno-v4"
    | "suno/suno-v4-5"
    | "suno/suno-v4-5+"
    | "suno/suno-v5"
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
    | "z-ai/glm-4-1v-9b"
    | "z-ai/glm-4-1v-thinking-9b"
    | "z-ai/glm-4-32b-0414"
    | "z-ai/glm-4-5"
    | "z-ai/glm-4-5-air"
    | "z-ai/glm-4-5v"
    | "z-ai/glm-4-6-2025-09-30"
    | "z-ai/glm-4-6v-2025-12-08"
    | "z-ai/glm-4-6v-flash-2025-12-08"
    | "z-ai/glm-4-9b"
    | "z-ai/glm-4-9b-0414"
    | "z-ai/glm-4-9b-chat"
    | "z-ai/glm-4-9b-chat-1m"
    | "z-ai/glm-4v-9b"[];
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/endpoints";
  return client.request<{
    endpoints?: string[];
    ok?: boolean;
    sample_models?:
      | "ai21/jamba-large-1-5-2024-08-22"
      | "ai21/jamba-large-1-6-2025-03-06"
      | "ai21/jamba-large-1-7-2025-07-03"
      | "ai21/jamba-mini-1-5-2024-08-22"
      | "ai21/jamba-mini-1-6-2025-03-06"
      | "ai21/jamba-mini-1-7-2025-07-03"
      | "ai21/jamba-reasoning-3b-2025-10-08"
      | "amazon/nova-2-lite-2025-12-02"
      | "amazon/nova-2-omni-2025-12-02"
      | "amazon/nova-2-pro-2025-12-02"
      | "amazon/nova-2-sonic-2025-12-02"
      | "amazon/nova-canvas"
      | "amazon/nova-lite-1-0-2024-12-04"
      | "amazon/nova-micro-1-0-2024-12-04"
      | "amazon/nova-multimodal-embeddings-2025-12-02"
      | "amazon/nova-premier-2025-04-30"
      | "amazon/nova-pro-1-0-2024-12-04"
      | "amazon/nova-reel"
      | "amazon/nova-sonic"
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
      | "anthropic/claude-sonnet-4-2025-05-21"
      | "anthropic/claude-sonnet-4-5-2025-09-29"
      | "baidu/ernie-4-5-21b-a3b"
      | "baidu/ernie-4-5-21b-a3b-thinking"
      | "baidu/ernie-4-5-300b-a47b"
      | "baidu/ernie-4-5-vl-28b-a3b"
      | "baidu/ernie-4-5-vl-424b-a47b"
      | "baidu/qianfan-vl-3b"
      | "baidu/qianfan-vl-70b"
      | "baidu/qianfan-vl-8b"
      | "bytedance/seed-coder-8b-instruct"
      | "bytedance/seed-coder-8b-reasoning"
      | "bytedance/seed-oss-36b-instruct"
      | "cohere/c4ai-aya-expanse-32b"
      | "cohere/c4ai-aya-expanse-8b"
      | "cohere/c4ai-aya-vision-32b"
      | "cohere/c4ai-aya-vision-8b"
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
      | "cohere/embed-v4"
      | "cohere/rerank-multilingual-v3"
      | "cohere/rerank-v3-5"
      | "cohere/rerenk-english-v3"
      | "deepseek/deepseek-coder-v2-2024-06-14"
      | "deepseek/deepseek-coder-v2-2024-07-24"
      | "deepseek/deepseek-ocr-2025-10-20"
      | "deepseek/deepseek-r1-2025-01-20"
      | "deepseek/deepseek-r1-2025-05-28"
      | "deepseek/deepseek-r1-lite-preview"
      | "deepseek/deepseek-v2-2024-05-17"
      | "deepseek/deepseek-v2-2024-06-28"
      | "deepseek/deepseek-v2-5"
      | "deepseek/deepseek-v2-5-2024-05-08"
      | "deepseek/deepseek-v3-1"
      | "deepseek/deepseek-v3-1-terminus-2025-09-22"
      | "deepseek/deepseek-v3-2-2025-12-01"
      | "deepseek/deepseek-v3-2-exp-2025-09-29"
      | "deepseek/deepseek-v3-2-speciale-2025-12-01"
      | "deepseek/deepseek-v3-2024-12-25"
      | "deepseek/deepseek-v3-2025-03-25"
      | "deepseek/deepseek-vl2-2024-12-13"
      | "deepseek/deepseek-vl2-small-2024-12-13"
      | "deepseek/deepseek-vl2-tiny-2024-12-13"
      | "essential-ai/rnj-1-2025-12-06"
      | "google/chat-bison"
      | "google/code-gecko"
      | "google/embedding-001-2023-12-13"
      | "google/gemini-1-0-nano-2023-12-06"
      | "google/gemini-1-0-pro-2023-12-06"
      | "google/gemini-1-0-pro-vision-001"
      | "google/gemini-1-0-ultra-2023-12-06"
      | "google/gemini-1-5-flash-001-2024-05-23"
      | "google/gemini-1-5-flash-002-2024-09-24"
      | "google/gemini-1-5-flash-8b-2024-03-15"
      | "google/gemini-1-5-flash-8b-exp-2024-08-27"
      | "google/gemini-1-5-flash-8b-exp-2024-09-24"
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
      | "google/gemini-2-5-flash-image-preview"
      | "google/gemini-2-5-flash-lite-preview-2025-06-17"
      | "google/gemini-2-5-flash-lite-preview-2025-09-25"
      | "google/gemini-2-5-flash-native-audio-preview"
      | "google/gemini-2-5-flash-preview-2025-04-17"
      | "google/gemini-2-5-flash-preview-2025-05-20"
      | "google/gemini-2-5-flash-preview-2025-09-25"
      | "google/gemini-2-5-flash-preview-native-audio-dialog"
      | "google/gemini-2-5-flash-preview-tts"
      | "google/gemini-2-5-flash-preview-tts-2025-12-10"
      | "google/gemini-2-5-pro-experimental"
      | "google/gemini-2-5-pro-preview-2025-05-06"
      | "google/gemini-2-5-pro-preview-2025-06-05"
      | "google/gemini-2-5-pro-preview-tts"
      | "google/gemini-2-5-pro-preview-tts-2025-12-10"
      | "google/gemini-3-0-flash"
      | "google/gemini-3-0-flash-lite"
      | "google/gemini-3-0-pro-preview-2025-11-18"
      | "google/gemini-3-flash-image"
      | "google/gemini-3-pro-image-preview-2025-11-20"
      | "google/gemini-diffusion"
      | "google/gemini-embedding-001-2025-05-20"
      | "google/gemini-embedding-exp-0307-2025-03-07"
      | "google/gemini-exp-1114-2024-11-14"
      | "google/gemini-exp-1121-2024-11-21"
      | "google/gemini-exp-1206"
      | "google/gemini-live-2-5-flash-preview-2025-04-09"
      | "google/gemini-robotics-er-1-5-preview"
      | "google/gemma-1-2b-2024-02-21"
      | "google/gemma-1-7b-2024-02-21"
      | "google/gemma-2-27b-2024-06-27"
      | "google/gemma-2-2b-2024-07-31"
      | "google/gemma-2-9b-2024-06-27"
      | "google/gemma-3-12b-2025-03-12"
      | "google/gemma-3-1b-2025-03-12"
      | "google/gemma-3-27b-2025-03-12"
      | "google/gemma-3-4b-2025-03-12"
      | "google/gemma-3n-e2b"
      | "google/gemma-3n-e4b-2025-05-20"
      | "google/image-generation-002"
      | "google/image-generation-005"
      | "google/image-generation-006"
      | "google/image-text"
      | "google/imagen-3-0-generate-001"
      | "google/imagen-3-0-generate-002-2025-02-06"
      | "google/imagen-4-0-fast-generate-001"
      | "google/imagen-4-0-generate-001-2025-08-14"
      | "google/imagen-4-0-ultra-generate-001-2025-08-14"
      | "google/imagen-4-preview"
      | "google/imagen-4-ultra-preview-2025-08-14"
      | "google/learnlm-1-5-pro-experimental"
      | "google/learnlm-2-0-flash-experimental"
      | "google/multimodal-embedding-001"
      | "google/text-bison"
      | "google/text-embedding-004"
      | "google/text-embedding-005"
      | "google/text-embedding-gecko-001-2023-12-13"
      | "google/text-embedding-gecko-002"
      | "google/text-embedding-gecko-003"
      | "google/text-embedding-gecko-multilingual-001"
      | "google/text-multilingual-embedding-002"
      | "google/veo-2-2025-04-09"
      | "google/veo-3-0-fast-generate-preview-2025-07-17"
      | "google/veo-3-0-generate-preview-2025-07-17"
      | "google/veo-3-1-fast-preview-2025-10-15"
      | "google/veo-3-1-preview-2025-10-15"
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
      | "lg/exaone-3-0-2024-08-07"
      | "lg/exaone-3-5-2-4b-2024-12-09"
      | "lg/exaone-3-5-32b-2024-12-09"
      | "lg/exaone-3-5-7-8b-2024-12-09"
      | "lg/exaone-4-0-1-2b-2025-07-15"
      | "lg/exaone-4-0-32b-2025-07-15"
      | "lg/exaone-deep-2-4b-2025-03-18"
      | "lg/exaone-deep-32b-2025-03-18"
      | "lg/exaone-deep-7-8b-2025-03-18"
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
      | "minimax/hailuo-02"
      | "minimax/i2v-01-director"
      | "minimax/i2v-01-live"
      | "minimax/image-01"
      | "minimax/minimax-m1-2025-06-16"
      | "minimax/minimax-m1-40k"
      | "minimax/minimax-m2-1"
      | "minimax/minimax-m2-2025-10-27"
      | "minimax/minimax-text-01"
      | "minimax/minimax-vl-01"
      | "minimax/music-1-5"
      | "minimax/s2v-01"
      | "minimax/speech-01-hd"
      | "minimax/speech-01-turbo"
      | "minimax/speech-02-hd"
      | "minimax/speech-02-turbo"
      | "minimax/speech-2-5-hd-preview"
      | "minimax/speech-2-5-turbo-preview"
      | "minimax/t2v-01-director"
      | "mistral/codestral-22b-2024-05-29"
      | "mistral/codestral-2405"
      | "mistral/codestral-2501"
      | "mistral/codestral-2508"
      | "mistral/codestral-embed"
      | "mistral/devstral-2-2025-12-09"
      | "mistral/devstral-medium-1-1-2025-07-10"
      | "mistral/devstral-small"
      | "mistral/devstral-small-1-1-2025-07-10"
      | "mistral/devstral-small-2-2025-12-09"
      | "mistral/magistral-medium-2025-06-10"
      | "mistral/magistral-medium-2507"
      | "mistral/magistral-medium-2509"
      | "mistral/magistral-small-2025-06-10"
      | "mistral/magistral-small-2507"
      | "mistral/magistral-small-2509"
      | "mistral/mamba-codestral-7b"
      | "mistral/mathstral-7b"
      | "mistral/ministral-3-14b-2025-12-02"
      | "mistral/ministral-3-3b-2025-12-02"
      | "mistral/ministral-3-8b-2025-12-02"
      | "mistral/ministral-3b-2410"
      | "mistral/ministral-8b-2410"
      | "mistral/ministral-8b-instruct-2024-10-16"
      | "mistral/mistral-7b"
      | "mistral/mistral-embed"
      | "mistral/mistral-large-2-2024-07-24"
      | "mistral/mistral-large-2402"
      | "mistral/mistral-large-2407"
      | "mistral/mistral-large-2411"
      | "mistral/mistral-large-3-675b-2025-12-02"
      | "mistral/mistral-medium-2312"
      | "mistral/mistral-medium-2505"
      | "mistral/mistral-medium-2508"
      | "mistral/mistral-moderation-2411"
      | "mistral/mistral-nemo-instruct-2024-07-18"
      | "mistral/mistral-ocr-2503"
      | "mistral/mistral-ocr-2505"
      | "mistral/mistral-saba-2502"
      | "mistral/mistral-small-2024-09-17"
      | "mistral/mistral-small-2402"
      | "mistral/mistral-small-2407"
      | "mistral/mistral-small-2501"
      | "mistral/mistral-small-2503"
      | "mistral/mistral-small-2506"
      | "mistral/mistral-small-3-1-24b-base-2025-03-17"
      | "mistral/mistral-small-3-1-24b-instruct-2025-03-17"
      | "mistral/mistral-small-3-2-2025-06-20"
      | "mistral/mistral-small-3-24b-base-2025-01-30"
      | "mistral/mistral-small-3-24b-instruct-2025-01-30"
      | "mistral/mixtral-8x22b"
      | "mistral/mixtral-8x7b"
      | "mistral/open-codestral-mamba"
      | "mistral/open-mistral-7b"
      | "mistral/open-mistral-nemo"
      | "mistral/open-mixtral-8x22b"
      | "mistral/open-mixtral-8x7b"
      | "mistral/pixtral-12b-base-2024-09-17"
      | "mistral/pixtral-large-2024-11-18"
      | "mistral/pixtral-large-2411"
      | "mistral/voxtral-mini-2507"
      | "mistral/voxtral-small-2507"
      | "moonshotai/kimi-k1-5-2025-01-20"
      | "moonshotai/kimi-k2-base-2025-07-11"
      | "moonshotai/kimi-k2-instruct-0905"
      | "moonshotai/kimi-k2-instruct-2025-07-11"
      | "moonshotai/kimi-k2-thinking-2025-11-06"
      | "moonshotai/kimi-vl-a3b-instruct"
      | "moonshotai/kimi-vl-a3b-thinking"
      | "moonshotai/kimi-vl-a3b-thinking-2506"
      | "nous/hermes-2-pro-llama-3-70b"
      | "nous/hermes-2-pro-llama-3-8b"
      | "nous/hermes-2-pro-mistral-7b"
      | "nous/hermes-2-theta-llama-3-70b"
      | "nous/hermes-2-theta-llama-3-8b"
      | "nous/hermes-3-llama-3-1-405b"
      | "nous/hermes-3-llama-3-1-70b"
      | "nous/hermes-3-llama-3-1-8b"
      | "nous/hermes-3-llama-3-2-3b"
      | "nous/hermes-4-14b"
      | "nous/hermes-4-3-36b-2025-12-03"
      | "nous/hermes-4-405b"
      | "nous/hermes-4-70b"
      | "nous/nomos-1-2025-12-09"
      | "nvidia/llama-3-1-nemotron-70b-instruct-2024-10-01"
      | "nvidia/llama-3-1-nemotron-nano-4b-v1-1"
      | "nvidia/llama-3-1-nemotron-nano-8b-v1-2025-03-18"
      | "nvidia/llama-3-1-nemotron-ultra-253b-v1-2025-04-07"
      | "nvidia/llama-3-3-nemotron-super-49b-v1-2025-03-18"
      | "nvidia/llama-3-3-nemotron-super-49b-v1-5"
      | "nvidia/nemotron-nano-3-30b-a3b"
      | "nvidia/nvidia-nemotron-nano-12b-v2"
      | "nvidia/nvidia-nemotron-nano-9b-v2"
      | "nvidia/openreasoning-nemotron-1-5b"
      | "nvidia/openreasoning-nemotron-14b"
      | "nvidia/openreasoning-nemotron-32b"
      | "nvidia/openreasoning-nemotron-7b"
      | "openai/ada-2020-06-11"
      | "openai/babbage-002"
      | "openai/babbage-2020-06-11"
      | "openai/chatgpt-4o"
      | "openai/code-cushman-001"
      | "openai/code-cushman-002"
      | "openai/code-davinci-001"
      | "openai/code-davinci-002"
      | "openai/code-davinci-edit-001"
      | "openai/code-search-ada-code-001"
      | "openai/code-search-babbage-code-001"
      | "openai/code-search-babbage-text-001"
      | "openai/codes-search-ada-text-001"
      | "openai/codex-mini-2025-05-16"
      | "openai/computer-use-preview"
      | "openai/curie-2020-06-11"
      | "openai/dall-e-2-2022-09-28"
      | "openai/dall-e-3-2023-10-19"
      | "openai/davinci-002"
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
      | "openai/gpt-4o-mini-audio-preview"
      | "openai/gpt-4o-mini-realtime-preview"
      | "openai/gpt-4o-mini-search-preview"
      | "openai/gpt-4o-mini-transcribe"
      | "openai/gpt-4o-mini-tts"
      | "openai/gpt-4o-realtime-preview-2024-10-01"
      | "openai/gpt-4o-realtime-preview-2024-12-17"
      | "openai/gpt-4o-realtime-preview-2025-06-03"
      | "openai/gpt-4o-search-preview"
      | "openai/gpt-4o-transcribe"
      | "openai/gpt-4o-transcribe-diarize-2025-10-15"
      | "openai/gpt-5-1-2025-11-12"
      | "openai/gpt-5-1-chat-2025-11-13"
      | "openai/gpt-5-1-codex-2025-11-13"
      | "openai/gpt-5-1-codex-max-2025-11-19"
      | "openai/gpt-5-1-codex-mini-2025-11-13"
      | "openai/gpt-5-1-pro"
      | "openai/gpt-5-2-2025-12-11"
      | "openai/gpt-5-2-chat-2025-12-11"
      | "openai/gpt-5-2-pro-2025-12-11"
      | "openai/gpt-5-2025-08-07"
      | "openai/gpt-5-chat-2025-08-07"
      | "openai/gpt-5-codex-2025-09-15"
      | "openai/gpt-5-codex-mini-2025-11-07"
      | "openai/gpt-5-mini-2025-08-07"
      | "openai/gpt-5-nano-2025-08-07"
      | "openai/gpt-5-pro-2025-08-07"
      | "openai/gpt-5-search-api-2025-10-14"
      | "openai/gpt-6"
      | "openai/gpt-6-mini"
      | "openai/gpt-6-nano"
      | "openai/gpt-6-pro"
      | "openai/gpt-audio"
      | "openai/gpt-audio-mini-2025-10-06"
      | "openai/gpt-image-1"
      | "openai/gpt-image-1-mini-2025-10-06"
      | "openai/gpt-oss-120b-2025-08-05"
      | "openai/gpt-oss-20b-2025-08-05"
      | "openai/gpt-oss-safeguard-120b-2025-10-29"
      | "openai/gpt-oss-safeguard-20b-2025-10-29"
      | "openai/gpt-realtime"
      | "openai/gpt-realtime-mini-2025-10-06"
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
      | "openai/sora-2-pro-2025-10-03"
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
      | "qwen/qvq-72b-preview-2024-12-25"
      | "qwen/qwen-3-omni-flash-2025-12-08"
      | "qwen/qwen-3-tts-2025-12-05"
      | "qwen/qwen2-5-14b-instruct-2024-09-19"
      | "qwen/qwen2-5-32b-instruct-2024-09-19"
      | "qwen/qwen2-5-72b-instruct-2024-09-19"
      | "qwen/qwen2-5-7b-instruct-2024-09-19"
      | "qwen/qwen2-5-coder-32b-instruct-2024-09-19"
      | "qwen/qwen2-5-coder-7b-instruct-2024-09-19"
      | "qwen/qwen2-5-omni-7b-2025-03-27"
      | "qwen/qwen2-5-vl-32b-instruct-2025-02-28"
      | "qwen/qwen2-5-vl-72b-instruct-2025-01-26"
      | "qwen/qwen2-5-vl-7b-instruct-2025-01-26"
      | "qwen/qwen2-72b-instruct-2024-07-23"
      | "qwen/qwen2-7b-instruct-2024-07-23"
      | "qwen/qwen2-vl-72b-instruct-2024-08-29"
      | "qwen/qwen3-235b-a22b-2025-04-29"
      | "qwen/qwen3-235b-a22b-thinking-2507-2025-07-25"
      | "qwen/qwen3-30b-a3b-2025-04-29"
      | "qwen/qwen3-32b-2025-04-29"
      | "qwen/qwen3-a235-a22b-instruct-2507-2025-07-21"
      | "qwen/qwen3-coder-480b-a35b-instruct-2025-07-22"
      | "qwen/qwq-32b-2025-03-05"
      | "qwen/qwq-32b-preview-2024-11-28"
      | "suno/suno-v3-5"
      | "suno/suno-v4"
      | "suno/suno-v4-5"
      | "suno/suno-v4-5+"
      | "suno/suno-v5"
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
      | "z-ai/glm-4-1v-9b"
      | "z-ai/glm-4-1v-thinking-9b"
      | "z-ai/glm-4-32b-0414"
      | "z-ai/glm-4-5"
      | "z-ai/glm-4-5-air"
      | "z-ai/glm-4-5v"
      | "z-ai/glm-4-6-2025-09-30"
      | "z-ai/glm-4-6v-2025-12-08"
      | "z-ai/glm-4-6v-flash-2025-12-08"
      | "z-ai/glm-4-9b"
      | "z-ai/glm-4-9b-0414"
      | "z-ai/glm-4-9b-chat"
      | "z-ai/glm-4-9b-chat-1m"
      | "z-ai/glm-4v-9b"[];
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
 * Returns a list of files that belong to the user's organization.
 */
export async function listFiles(
  client: Client,
  args: ListFilesParams = {},
): Promise<{
  data?: {
    bytes?: number;
    created_at?: number;
    filename?: string;
    id?: string;
    object?: string;
    purpose?: string;
    status?: string;
    status_details?: {};
  }[];
  object?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/files";
  return client.request<{
    data?: {
      bytes?: number;
      created_at?: number;
      filename?: string;
      id?: string;
      object?: string;
      purpose?: string;
      status?: string;
      status_details?: {};
    }[];
    object?: string;
  }>({
    method: "GET",
    path: resolvedPath,
    query,
    headers,
    body,
  });
}

export type ListKeysPlaceholderParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Placeholder route; currently returns not implemented.
 */
export async function listKeysPlaceholder(
  client: Client,
  args: ListKeysPlaceholderParams = {},
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

export type ListModelsParams = {
  path?: Record<string, never>;
  query?: {
    endpoints?: string[];
    input_types?: string[];
    limit?: number;
    offset?: number;
    organisation?:
      | "ai21"
      | "amazon"
      | "anthropic"
      | "baidu"
      | "black-forest-labs"
      | "bytedance"
      | "cohere"
      | "deepseek"
      | "eleven-labs"
      | "essential-ai"
      | "google"
      | "ibm"
      | "inclusionai"
      | "lg"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshotai"
      | "nous"
      | "nvidia"
      | "openai"
      | "perplexity"
      | "qwen"
      | "suno"
      | "x-ai"
      | "z-ai"
      | "ai21"
      | "amazon"
      | "anthropic"
      | "baidu"
      | "black-forest-labs"
      | "bytedance"
      | "cohere"
      | "deepseek"
      | "eleven-labs"
      | "essential-ai"
      | "google"
      | "ibm"
      | "inclusionai"
      | "lg"
      | "meta"
      | "microsoft"
      | "minimax"
      | "mistral"
      | "moonshotai"
      | "nous"
      | "nvidia"
      | "openai"
      | "perplexity"
      | "qwen"
      | "suno"
      | "x-ai"
      | "z-ai"[];
    output_types?: string[];
    params?: string[];
  };
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a list of available models.
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
  const resolvedPath = "/models";
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
    team_id: string;
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
    team_id: string;
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
 * Retrieves a batch.
 */
export async function retrieveBatch(
  client: Client,
  args: RetrieveBatchParams = {},
): Promise<{
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
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/batches/${encodeURIComponent(String(path?.batch_id))}`;
  return client.request<{
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
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    status?: string;
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
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  status?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/batch/${encodeURIComponent(String(path?.id))}`;
  return client.request<{
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
    request_counts?: {
      completed?: number;
      failed?: number;
      total?: number;
    };
    status?: string;
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
 * Returns information about a specific file.
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

export type RootParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns a welcome message.
 */
export async function root(
  client: Client,
  args: RootParams = {},
): Promise<{
  message?: string;
  timestamp?: string;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = "/";
  return client.request<{
    message?: string;
    timestamp?: string;
  }>({
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
 * Upload a file that can be used across various endpoints.
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

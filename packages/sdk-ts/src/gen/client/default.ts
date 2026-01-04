import type { Client } from "../../runtime/client.js";

export type CreateBatchParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    completion_window?: string;
    endpoint: string;
    input_file_id: string;
    metadata?: {};
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

export type CreateChatCompletionParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
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
    dimensions?: number;
    encoding_format?: string;
    input: string | string[];
    model: string;
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

export type CreateResponseParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    background?: boolean;
    conversation?: string | {};
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
    duration?: number;
    model: string;
    prompt: string;
    ratio?: string;
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

export type GetAnalyticsParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    access_token?: string;
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
  const resolvedPath = "/generation";
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
  const resolvedPath = "/healthz";
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

import type { Client } from "../../runtime/client.js";

export type CreateAnthropicMessageParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
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
    endpoint: string;
    input_file_id: string;
    metadata?: {};
    provider?: {
      ignore?: string[];
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
    provider?: {
      ignore?: string[];
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
  body?: unknown | unknown;
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

export type CreateOcrParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
    echo_upstream_request?: boolean;
    image: string;
    language?: string;
    model: string;
    provider?: {
      ignore?: string[];
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
    created_by: string;
    name: string;
    scopes?: string;
    team_id: string;
  };
};

/**
 * Creates a new provisioning key for a team.
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
    provider?: {
      ignore?: string[];
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

export type DeleteProvisioningKeyParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Permanently deletes a provisioning key.
 */
export async function deleteProvisioningKey(
  client: Client,
  args: DeleteProvisioningKeyParams = {},
): Promise<{
  message?: string;
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/provisioning/keys/${encodeURIComponent(String(path?.id))}`;
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

export type GenerateMusicParams = {
  path?: Record<string, never>;
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: {
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

export type GetProvisioningKeyParams = {
  path?: {
    id: string;
  };
  query?: Record<string, never>;
  headers?: Record<string, never>;
  body?: never;
};

/**
 * Returns details of a specific provisioning key.
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
  const resolvedPath = `/provisioning/keys/${encodeURIComponent(String(path?.id))}`;
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
 * Returns all provisioning keys for a team.
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
 * Updates the name, status, or blocked state of a provisioning key.
 */
export async function updateProvisioningKey(
  client: Client,
  args: UpdateProvisioningKeyParams = {},
): Promise<{
  message?: string;
  ok?: boolean;
}> {
  const { path, query, headers, body } = args;
  const resolvedPath = `/provisioning/keys/${encodeURIComponent(String(path?.id))}`;
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

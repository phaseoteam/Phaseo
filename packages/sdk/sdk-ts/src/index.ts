import type {
  AnthropicMessagesRequest,
  AnthropicMessagesResponse,
  AudioSpeechRequest,
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  AudioTranslationRequest,
  AudioTranslationResponse,
  BatchRequest,
  BatchResponse,
  ChatCompletionsRequest,
  ChatCompletionsResponse,
  ChatMessage,
  EmbeddingsRequest,
  EmbeddingsResponse,
  FileResponse as FileObject,
  ImagesEditRequest,
  ImagesEditResponse,
  ImagesGenerationRequest,
  ImagesGenerationResponse,
  ListFilesResponse as FileListResponse,
  ModelId,
  ModerationsRequest,
  ModerationsResponse,
  ResponsesRequest,
  ResponsesResponse,
  VideoGenerationRequest,
  VideoGenerationResponse
} from "./oapi-gen/models/index.js";
import * as ops from "./oapi-gen/client/index.js";
import { Client } from "./runtime/client.js";
import { TelemetryCapture, extractChatMetadata, extractImageMetadata } from "./devtools/telemetry.js";
import type { DevToolsConfig } from "@ai-stats/devtools-core";

export type ModelIdLiteral = ModelId;
export const MODEL_IDS: ModelIdLiteral[] = [];
export const MODEL_ID_SET = new Set<ModelIdLiteral>(MODEL_IDS);

type Options = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  devtools?: Partial<DevToolsConfig>;
};

type MessageContentPartInput = Record<string, unknown> | string;

type ChatMessageInput =
  | { role: "system"; content: string | MessageContentPartInput[]; name?: string }
  | { role: "user"; content: string | MessageContentPartInput[]; name?: string }
  | { role: "assistant"; content?: string | MessageContentPartInput[]; name?: string; tool_calls?: Array<Record<string, unknown>> }
  | { role: "tool"; content: string | MessageContentPartInput[]; name?: string; tool_call_id: string };

export type ChatCompletionsParams = Omit<ChatCompletionsRequest, "model" | "messages"> & {
  model: ModelIdLiteral;
  messages: ChatMessageInput[];
};

type ChatCompletionsCreateParams = ChatCompletionsParams & {
  stream?: boolean | null;
};

type ResponsesCreateParams = ResponsesRequest & {
  stream?: boolean | null;
};

type MessagesCreateParams = AnthropicMessagesRequest & {
  stream?: boolean | null;
};

export type ComingSoonResponse = {
  status: "coming_soon";
  endpoint: string;
  message: string;
};

const DEFAULT_BASE_URL = "https://api.phaseo.app/v1";

export type {
  AnthropicMessagesRequest,
  AnthropicMessagesResponse,
  AudioSpeechRequest,
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  AudioTranslationRequest,
  AudioTranslationResponse,
  BatchRequest,
  BatchResponse,
  ChatCompletionsRequest,
  ChatCompletionsResponse,
  ChatMessage,
  EmbeddingsRequest,
  EmbeddingsResponse,
  FileObject,
  FileListResponse,
  ImagesEditRequest,
  ImagesEditResponse,
  ImagesGenerationRequest,
  ImagesGenerationResponse,
  ModelId,
  ModerationsRequest,
  ModerationsResponse,
  ResponsesRequest,
  ResponsesResponse,
  VideoGenerationRequest,
  VideoGenerationResponse
};

export type ModelListResponse = Awaited<ReturnType<typeof ops.listModels>>;
export type Health200Response = Awaited<ReturnType<typeof ops.health>>;
export type ProvidersResponse = Awaited<ReturnType<typeof ops.listProviders>>;
export type CreditsResponse = Awaited<ReturnType<typeof ops.getCredits>>;
export type ActivityResponse = Awaited<ReturnType<typeof ops.getActivity>>;
export type AnalyticsResponse = Awaited<ReturnType<typeof ops.getAnalytics>>;
export type ProvisioningKeysResponse = Awaited<ReturnType<typeof ops.listProvisioningKeys>>;
export type ProvisioningKeyResponse = Awaited<ReturnType<typeof ops.getProvisioningKey>>;

export class AIStats {
  private readonly client: Client;
  private readonly basePath: string;
  private readonly headers: Record<string, string>;
  private readonly telemetry: TelemetryCapture;
  public readonly chat: {
    completions: {
      create(params: ChatCompletionsCreateParams): Promise<ChatCompletionsResponse> | AsyncGenerator<string>;
    };
  };
  public readonly responses: {
    create(params: ResponsesCreateParams): Promise<ResponsesResponse> | AsyncGenerator<string>;
  };
  public readonly messages: {
    create(params: MessagesCreateParams): Promise<AnthropicMessagesResponse> | AsyncGenerator<string>;
  };

  constructor(private readonly opts: Options) {
    this.basePath = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.headers = { Authorization: `Bearer ${opts.apiKey}` };
    this.client = new Client({
      baseUrl: this.basePath,
      headers: this.headers,
      timeoutMs: opts.timeoutMs,
      fetchImpl: opts.fetchImpl
    });
    this.telemetry = new TelemetryCapture(opts.devtools, "0.2.1");
    this.chat = {
      completions: {
        create: (params) => {
          if (params.stream) {
            return this.streamText(params);
          }
          return this.generateText(params);
        }
      }
    };
    this.responses = {
      create: (params) => {
        if (params.stream) {
          return this.streamResponse(params);
        }
        return this.generateResponse(params);
      }
    };
    this.messages = {
      create: (params) => {
        if (params.stream) {
          return this.streamMessage(params);
        }
        return ops.createAnthropicMessage(this.client, { body: params });
      }
    };
  }

  async generateText(req: ChatCompletionsParams): Promise<ChatCompletionsResponse> {
    const payload = { ...req, stream: false, messages: req.messages.map(normalizeMessage) };
    return this.telemetry.wrap(
      "chat.completions",
      () => ops.createChatCompletion(this.client, { body: payload }),
      () => payload,
      extractChatMetadata
    );
  }

  async *streamText(req: ChatCompletionsParams): AsyncGenerator<string> {
    const payload = { ...req, stream: true, messages: req.messages.map(normalizeMessage) };
    const body = JSON.stringify(payload);

    const generator = async function* (this: AIStats) {
      const res = await fetch(`${this.basePath}/chat/completions`, {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`Stream request failed: ${res.status} ${res.statusText} - ${text}`);
      }
      for await (const line of readSseLines(res)) {
        yield line;
      }
    }.bind(this);

    yield* this.telemetry.wrapStream(
      "chat.completions",
      generator(),
      () => payload
    );
  }

  generateImage(req: ImagesGenerationRequest): Promise<ImagesGenerationResponse> {
    return this.comingSoon("images/generations", req) as unknown as Promise<ImagesGenerationResponse>;
  }

  async generateImageEdit(req: ImagesEditRequest): Promise<ImagesEditResponse> {
    return this.comingSoon("images/edits", req) as unknown as Promise<ImagesEditResponse>;
  }

  generateModeration(req: ModerationsRequest): Promise<ModerationsResponse> {
    return this.telemetry.wrap(
      "moderations",
      () => ops.createModeration(this.client, { body: req }),
      () => req
    );
  }

  generateVideo(req: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    return this.comingSoon("videos", req) as unknown as Promise<VideoGenerationResponse>;
  }

  generateEmbedding(body: EmbeddingsRequest): Promise<EmbeddingsResponse> {
    return this.telemetry.wrap(
      "embeddings",
      () => ops.createEmbedding(this.client, { body: body as any }),
      () => body
    );
  }

  generateResponse(req: ResponsesRequest): Promise<ResponsesResponse> {
    return this.telemetry.wrap(
      "responses",
      () => ops.createResponse(this.client, { body: req }),
      () => req,
      extractChatMetadata
    );
  }

  async *streamResponse(req: ResponsesRequest): AsyncGenerator<string> {
    const payload = { ...req, stream: true };

    const generator = async function* (this: AIStats) {
      const res = await fetch(`${this.basePath}/responses`, {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`Stream request failed: ${res.status} ${res.statusText} - ${text}`);
      }
      for await (const line of readSseLines(res)) {
        yield line;
      }
    }.bind(this);

    yield* this.telemetry.wrapStream(
      "responses",
      generator(),
      () => payload
    );
  }

  async *streamMessage(req: MessagesCreateParams): AsyncGenerator<string> {
    const payload = { ...req, stream: true };

    const generator = async function* (this: AIStats) {
      const res = await fetch(`${this.basePath}/messages`, {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`Stream request failed: ${res.status} ${res.statusText} - ${text}`);
      }
      for await (const line of readSseLines(res)) {
        yield line;
      }
    }.bind(this);

    yield* this.telemetry.wrapStream(
      "messages",
      generator(),
      () => payload
    );
  }

  createBatch(req: BatchRequest): Promise<BatchResponse> {
    return this.comingSoon("batches", req) as unknown as Promise<BatchResponse>;
  }

  getBatch(batchId: string): Promise<BatchResponse> {
    return this.comingSoon("batches/{batch_id}", { batch_id: batchId }) as unknown as Promise<BatchResponse>;
  }

  listFiles(): Promise<FileListResponse> {
    return this.comingSoon("files", {}) as unknown as Promise<FileListResponse>;
  }

  getFile(fileId: string): Promise<FileObject> {
    return this.comingSoon("files/{file_id}", { file_id: fileId }) as unknown as Promise<FileObject>;
  }

  async uploadFile(params: { purpose?: string; file: Blob | File | BufferSource | string }): Promise<FileObject> {
    return this.comingSoon("files", { purpose: params.purpose }) as unknown as Promise<FileObject>;
  }

  getModels(params: Record<string, unknown> = {}): Promise<ModelListResponse> {
    return this.telemetry.wrap(
      "models.list",
      () => ops.listModels(this.client, { query: params as any }),
      () => params
    );
  }

  getHealth(): Promise<Health200Response> {
    return this.telemetry.wrap(
      "health",
      () => ops.health(this.client, {}),
      () => ({})
    );
  }

  getAnalytics(params: Record<string, unknown> = {}): Promise<AnalyticsResponse> {
    return this.telemetry.wrap(
      "analytics",
      () => ops.getAnalytics(this.client, { query: params as any }),
      () => params
    );
  }

  async generateSpeech(body: AudioSpeechRequest): Promise<Blob> {
    return this.comingSoon("audio/speech", body) as unknown as Promise<Blob>;
  }

  async generateTranscription(body: AudioTranscriptionRequest): Promise<AudioTranscriptionResponse> {
    return this.comingSoon("audio/transcriptions", {
      ...body,
      audio_url: body.audio_url ? "[URL]" : undefined,
      audio_b64: body.audio_b64 ? "[B64]" : undefined
    }) as unknown as Promise<AudioTranscriptionResponse>;
  }

  async generateTranslation(body: AudioTranslationRequest): Promise<AudioTranslationResponse> {
    return this.comingSoon("audio/translations", {
      ...body,
      audio_url: body.audio_url ? "[URL]" : undefined,
      audio_b64: body.audio_b64 ? "[B64]" : undefined
    }) as unknown as Promise<AudioTranslationResponse>;
  }

  async getGeneration(id: string): Promise<unknown> {
    return this.comingSoon("generation", { id }) as unknown as Promise<unknown>;
  }

  listProviders(params: Record<string, unknown> = {}): Promise<ProvidersResponse> {
    return this.telemetry.wrap(
      "providers",
      () => ops.listProviders(this.client, { query: params as any }),
      () => params
    );
  }

  getCredits(params: Record<string, unknown> = {}): Promise<CreditsResponse> {
    return this.telemetry.wrap(
      "credits",
      () => ops.getCredits(this.client, { query: params as any }),
      () => params
    );
  }

  getActivity(params: Record<string, unknown> = {}): Promise<ActivityResponse> {
    return this.telemetry.wrap(
      "activity",
      () => ops.getActivity(this.client, { query: params as any }),
      () => params
    );
  }

  listProvisioningKeys(params: Record<string, unknown> = {}): Promise<ProvisioningKeysResponse> {
    return this.telemetry.wrap(
      "provisioning.keys.list",
      () => ops.listProvisioningKeys(this.client, { query: params as any }),
      () => params
    );
  }

  createProvisioningKey(body: Record<string, unknown>): Promise<ProvisioningKeyResponse> {
    return this.telemetry.wrap(
      "provisioning.keys.create",
      () => ops.createProvisioningKey(this.client, { body: body as any }),
      () => body
    );
  }

  getProvisioningKey(id: string): Promise<ProvisioningKeyResponse> {
    return this.telemetry.wrap(
      "provisioning.keys.get",
      () => ops.getProvisioningKey(this.client, { path: { id } as any }),
      () => ({ id })
    );
  }

  updateProvisioningKey(id: string, body: Record<string, unknown>): Promise<ProvisioningKeyResponse> {
    return this.telemetry.wrap(
      "provisioning.keys.update",
      () => ops.updateProvisioningKey(this.client, { path: { id } as any, body: body as any }),
      () => ({ id, ...body })
    );
  }

  deleteProvisioningKey(id: string): Promise<ProvisioningKeyResponse> {
    return this.telemetry.wrap(
      "provisioning.keys.delete",
      () => ops.deleteProvisioningKey(this.client, { path: { id } as any }),
      () => ({ id })
    );
  }

  private comingSoon(endpoint: string, payload?: unknown): Promise<ComingSoonResponse> {
    return Promise.resolve({
      status: "coming_soon",
      endpoint,
      message: "This endpoint is not yet supported in the SDK.",
      payload: payload ?? {}
    } as ComingSoonResponse);
  }
}

function normalizeMessage(msg: ChatMessageInput): ChatMessage {
  return msg as unknown as ChatMessage;
}

async function* readSseLines(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        yield line;
      }
    }
    if (buffer.trim()) {
      yield buffer.trim();
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Compatibility layers - Drop-in replacements for OpenAI and Anthropic SDKs
 *
 * Usage:
 *   import { OpenAI } from '@ai-stats/sdk/compat/openai';
 *   import { Anthropic } from '@ai-stats/sdk/compat/anthropic';
 */
export { OpenAI } from "./compat/openai.js";
export { Anthropic } from "./compat/anthropic.js";

/**
 * Re-export compatibility types
 */
export type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionCreateParamsNonStreaming,
  ImageGenerateParams,
  AudioSpeechCreateParams,
  ModerationCreateParams
} from "./compat/openai.js";

export type {
  MessageCreateParams,
  MessageCreateParamsStreaming,
  MessageCreateParamsNonStreaming,
  Message,
  MessageParam,
  ContentBlock,
  MessageRole
} from "./compat/anthropic.js";

/**
 * Devtools integration
 *
 * Creates a devtools configuration that enables telemetry capture for debugging.
 * Works similarly to OpenRouter's devtools pattern.
 *
 * Usage:
 *   import { AIStats, createAIStatsDevtools } from '@ai-stats/sdk';
 *
 *   const client = new AIStats({
 *     apiKey: process.env.AI_STATS_API_KEY,
 *     devtools: createAIStatsDevtools()
 *   });
 *
 * @param options - Optional devtools configuration
 * @returns DevToolsConfig object to pass to AIStats constructor
 */
export function createAIStatsDevtools(options?: {
  /** Directory to store devtools data (default: .ai-stats-devtools) */
  directory?: string;
  /** How often to flush data to disk in ms (default: 1000) */
  flushIntervalMs?: number;
  /** Maximum queue size before forcing flush (default: 1000) */
  maxQueueSize?: number;
  /** Whether to capture HTTP headers (default: false) */
  captureHeaders?: boolean;
  /** Whether to save binary assets like images (default: true) */
  saveAssets?: boolean;
}): Partial<DevToolsConfig> {
  return {
    enabled: true,
    directory: options?.directory,
    flushIntervalMs: options?.flushIntervalMs,
    maxQueueSize: options?.maxQueueSize,
    captureHeaders: options?.captureHeaders,
    saveAssets: options?.saveAssets
  };
}

// Re-export devtools types for convenience
export type { DevToolsConfig, DevToolsEntry } from "@ai-stats/devtools-core";

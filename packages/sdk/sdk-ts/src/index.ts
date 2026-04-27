import type {
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
  DataModel,
  FileResponse as FileObject,
  ImagesEditRequest,
  ImagesEditResponse,
  ImagesGenerationRequest,
  ImagesGenerationResponse,
  ListFilesResponse as FileListResponse,
  ModelId as OapiModelId,
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
import type { DevToolsConfig } from "./devtools/core.js";

export type KnownModelId = OapiModelId;
export type ModelIdLiteral = KnownModelId;
/**
 * Model identifier in `provider/model` format (for example: `openai/gpt-5.4`).
 *
 * Model page URL pattern:
 * `https://ai-stats.phaseo.app/models/{provider/model}`
 */
// Allow new server-side models before a package release while preserving known-ID autocomplete.
export type ModelId = KnownModelId | (string & {});
export type OpenApiModelId = OapiModelId;

type Options = {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  devtools?: Partial<DevToolsConfig>;
  enableDeprecationWarnings?: boolean;
  warningsAsErrors?: boolean;
  logger?: AIStatsLogger;
};

export type AIStatsLogLevel = "info" | "warn" | "error";
export type AIStatsLogger = (level: AIStatsLogLevel, message: string, meta?: Record<string, unknown>) => void;

export type ModelLifecycleInfo = {
  modelId: string;
  status: "active" | "deprecated" | "retired";
  sourceStatus: string | null;
  deprecationDate: string | null;
  retirementDate: string | null;
  replacementModelId: string | null;
  message: string | null;
};

type MessageContentPartInput = Record<string, unknown> | string;
export type VideoOutputAccess = "bytes" | "signed_url" | "both";
export type VideoInputReference = {
  type: "image" | "video" | "mask";
  role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
  reference_type?: "asset" | "style" | "character" | "location" | "generic" | string;
  url?: string;
  data?: string;
  mime_type?: string;
  asset_id?: string;
};

export type VideoCreateRequest = {
  model: ModelId;
  prompt: string;
  duration_seconds?: number;
  size?: string;
  resolution?: string;
  aspect_ratio?: string;
  seed?: number;
  sample_count?: number;
  negative_prompt?: string;
  generate_audio?: boolean;
  enhance_prompt?: boolean;
  compression_quality?: number;
  person_generation?: string;
  resize_mode?: string;
  input_references?: VideoInputReference[];
  provider_params?: Record<string, unknown>;
  output?: { access?: VideoOutputAccess };
  webhook?: { url: string; secret?: string; events?: string[] };
  provider?: Record<string, unknown>;
  debug?: Record<string, unknown>;
  beta?: Record<string, unknown>;
};

export type VideoStatusResponse = {
  id: string;
  object: "video";
  status: "queued" | "in_progress" | "completed" | "failed" | "cancelled";
  polling_url: string;
  poll_after_seconds?: number;
  provider?: string | null;
  model?: string | null;
  created_at?: string | number | null;
  started_at?: string | number | null;
  completed_at?: string | number | null;
  progress?: number | null;
  progress_source?: "provider" | "estimated" | "none" | null;
  seconds?: number | null;
  size?: string | null;
  audio?: boolean | null;
  content_url?: string;
  download_url?: string | null;
  expires_at?: number | null;
  asset?: {
    id: string;
    mime_type?: string | null;
    bytes?: number | null;
    sha256?: string | null;
    width?: number | null;
    height?: number | null;
    duration_seconds?: number | null;
  } | null;
  outputs?: Array<{
    index?: number;
    mime_type?: string | null;
    bytes_available?: boolean;
    content_url?: string;
    download_url?: string;
    expires_at?: number | null;
  }>;
  usage?: Record<string, unknown>;
  error?: unknown;
};

type ChatMessageInput =
  | { role: "system"; content: string | MessageContentPartInput[]; name?: string }
  | { role: "user"; content: string | MessageContentPartInput[]; name?: string }
  | { role: "assistant"; content?: string | MessageContentPartInput[]; name?: string; tool_calls?: Array<Record<string, unknown>> }
  | { role: "tool"; content: string | MessageContentPartInput[]; name?: string; tool_call_id: string };

export type ChatCompletionsParams = Omit<ChatCompletionsRequest, "model" | "messages"> & {
  model: ModelId;
  messages: ChatMessageInput[];
};

const DEFAULT_BASE_URL = "https://api.phaseo.app/v1";

export type {
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
  DataModel,
  FileObject,
  FileListResponse,
  ImagesEditRequest,
  ImagesEditResponse,
  ImagesGenerationRequest,
  ImagesGenerationResponse,
  ModerationsRequest,
  ModerationsResponse,
  ResponsesRequest,
  ResponsesResponse,
  VideoGenerationRequest,
  VideoGenerationResponse
};

export type ModelListResponse = Awaited<ReturnType<typeof ops.listModels>>;
export type VideoModelsResponse = { object: "list"; data: Array<Record<string, unknown>> };
export type Healthz200Response = Awaited<ReturnType<typeof ops.healthz>>;
export { ops as operations };
export { ModelIds, MODEL_IDS, MODEL_ID_SET } from "./modelIds.js";
export type AIStatsOptions = Options;

export class AIStats {
  private readonly client: Client;
  private readonly basePath: string;
  private readonly headers: Record<string, string>;
  private readonly telemetry: TelemetryCapture;
  private readonly fetchImpl: typeof fetch;
  private readonly enableDeprecationWarnings: boolean;
  private readonly warningsAsErrors: boolean;
  private readonly logger?: AIStatsLogger;
  private readonly warnedModels = new Set<string>();
  private readonly modelLifecycleCache = new Map<string, ModelLifecycleInfo | null>();

  readonly responses = {
    create: async (req: ResponsesRequest): Promise<ResponsesResponse | AsyncGenerator<string>> => {
      if ((req as { stream?: boolean }).stream) {
        return this.streamResponse(req);
      }
      return this.generateResponse(req);
    }
  };

  readonly chat = {
    completions: {
      create: async (req: ChatCompletionsParams): Promise<ChatCompletionsResponse | AsyncGenerator<string>> => {
        if ((req as { stream?: boolean }).stream) {
          return this.streamText(req);
        }
        return this.generateText(req);
      }
    }
  };

  readonly models = {
    list: async (params: Record<string, unknown> = {}): Promise<ModelListResponse> => this.getModels(params),
    getDeprecationInfo: async (modelId: string): Promise<ModelLifecycleInfo | null> =>
      this.getModelDeprecationInfo(modelId),
    validate: async (modelId: string): Promise<{ ok: boolean; info: ModelLifecycleInfo | null; reason?: string }> =>
      this.validateModel(modelId),
  };

  readonly videos = {
    create: async (req: VideoCreateRequest): Promise<VideoStatusResponse> => this.generateVideo(req),
    get: async (videoId: string): Promise<VideoStatusResponse> => this.getVideo(videoId),
    content: async (videoId: string): Promise<Uint8Array> => this.getVideoContent(videoId),
    downloadUrl: async (
      videoId: string,
      body?: { ttl_seconds?: number; disposition?: "attachment" | "inline"; index?: number },
    ): Promise<{ download_url: string; expires_at: number }> => this.getVideoDownloadUrl(videoId, body),
    cancel: async (videoId: string): Promise<VideoStatusResponse> => this.cancelVideo(videoId),
    delete: async (videoId: string): Promise<{ id: string; object: "video"; deleted: boolean }> =>
      this.deleteVideo(videoId),
    listModels: async (): Promise<VideoModelsResponse> => this.listVideoModels(),
  };

  constructor(private readonly opts: Options = {}) {
    const apiKey = resolveApiKey(opts.apiKey);
    this.basePath = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.headers = { Authorization: `Bearer ${apiKey}` };
    this.client = new Client({
      baseUrl: this.basePath,
      headers: this.headers,
      timeoutMs: opts.timeoutMs,
      fetchImpl: opts.fetchImpl
    });
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.enableDeprecationWarnings = opts.enableDeprecationWarnings ?? true;
    this.warningsAsErrors = opts.warningsAsErrors ?? false;
    this.logger = opts.logger;

    this.telemetry = new TelemetryCapture(opts.devtools, "1.2.0");

  }

  rawClient(): Client {
    return this.client;
  }

  async request(method: string, path: string, options: {
    query?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}): Promise<unknown> {
    const url = new URL(path.replace(/^\/+/, ""), `${this.basePath}/`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        url.searchParams.set(key, String(value));
      }
    }
    const res = await this.fetchImpl(url.toString(), {
      method,
      headers: {
        ...this.headers,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {})
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed: ${res.status} ${res.statusText} - ${text}`);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async getModelDeprecationInfo(modelId: string): Promise<ModelLifecycleInfo | null> {
    if (!modelId || !modelId.trim()) return null;
    return this.resolveModelLifecycle(modelId.trim());
  }

  async validateModel(modelId: string): Promise<{ ok: boolean; info: ModelLifecycleInfo | null; reason?: string }> {
    const info = await this.getModelDeprecationInfo(modelId);
    if (!info) return { ok: true, info: null };
    if (!isModelRequestableForInference(info)) {
      return { ok: false, info, reason: buildInactiveModelRequestMessage(info) };
    }
    return { ok: true, info };
  }

  private async withLifecycleGuard<T>(payload: unknown, fn: () => Promise<T>): Promise<T> {
    await this.maybeWarnForPayload(payload);
    return fn();
  }

  private async maybeWarnForPayload(payload: unknown): Promise<void> {
    const modelId = extractModelIdFromPayload(payload);
    if (!modelId) return;
    await this.ensureModelRequestable(modelId);
    await this.maybeWarnForModel(modelId);
  }

  private async ensureModelRequestable(modelId: string): Promise<void> {
    const normalizedModelId = modelId.trim();
    if (!normalizedModelId) return;
    const lifecycle = await this.resolveModelLifecycle(normalizedModelId);
    if (!lifecycle) return;
    if (isModelRequestableForInference(lifecycle)) return;
    throw new Error(buildInactiveModelRequestMessage(lifecycle));
  }

  private async maybeWarnForModel(modelId: string): Promise<void> {
    if (!this.enableDeprecationWarnings) return;
    const normalizedModelId = modelId.trim();
    if (!normalizedModelId) return;
    const lifecycle = await this.resolveModelLifecycle(normalizedModelId);
    if (!lifecycle || lifecycle.status === "active") return;

    const message =
      lifecycle.message ??
      buildLifecycleMessage(lifecycle.status, lifecycle.modelId, lifecycle.deprecationDate, lifecycle.retirementDate, lifecycle.replacementModelId);

    if (this.warningsAsErrors) {
      throw new Error(message);
    }

    if (this.warnedModels.has(normalizedModelId)) return;
    this.warnedModels.add(normalizedModelId);
    if (this.logger) {
      this.logger("warn", message, lifecycle);
      return;
    }
    console.warn(message);
  }

  private async resolveModelLifecycle(modelId: string): Promise<ModelLifecycleInfo | null> {
    const normalizedModelId = modelId.trim();
    if (!normalizedModelId) return null;
    if (this.modelLifecycleCache.has(normalizedModelId)) {
      return this.modelLifecycleCache.get(normalizedModelId) ?? null;
    }

    try {
      const payload = await this.request("GET", "/data/models", {
        query: { model_id: normalizedModelId, limit: 1 },
      });
      const models = Array.isArray((payload as { models?: unknown }).models)
        ? ((payload as { models: DataModel[] }).models ?? [])
        : [];
      const model = models.find((entry) => (entry?.model_id ?? "").trim() === normalizedModelId);
      if (!model) {
        this.modelLifecycleCache.set(normalizedModelId, null);
        return null;
      }

      const lifecycle = toModelLifecycleInfo(model, normalizedModelId);
      this.modelLifecycleCache.set(normalizedModelId, lifecycle);
      return lifecycle;
    } catch {
      this.modelLifecycleCache.set(normalizedModelId, null);
      return null;
    }
  }

  async generateText(req: ChatCompletionsParams): Promise<ChatCompletionsResponse> {
    const payload = { ...req, stream: false, messages: req.messages.map(normalizeMessage) };
    return this.withLifecycleGuard(
      payload,
      () => this.telemetry.wrap(
        "chat.completions",
        () => ops.createChatCompletion(this.client, { body: payload }),
        () => payload,
        extractChatMetadata
      )
    );
  }

  async *streamText(req: ChatCompletionsParams): AsyncGenerator<string> {
    const payload = { ...req, stream: true, messages: req.messages.map(normalizeMessage) };
    await this.maybeWarnForPayload(payload);
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
    return this.withLifecycleGuard(
      req,
      () => this.telemetry.wrap(
        "images.generations",
        () => ops.createImage(this.client, { body: req }),
        () => req,
        extractImageMetadata
      )
    );
  }

  async generateImageEdit(req: ImagesEditRequest): Promise<ImagesEditResponse> {
    await this.maybeWarnForPayload(req);
    return this.telemetry.wrap(
      "images.edits",
      async () => {
        const form = new FormData();
        Object.entries(req).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            form.append(key, value as string | Blob);
          }
        });
        const res = await fetch(`${this.basePath}/images/edits`, {
          method: "POST",
          headers: this.headers,
          body: form
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Request failed: ${res.status} ${res.statusText} - ${text}`);
        }
        return (await res.json()) as ImagesEditResponse;
      },
      () => ({ ...req, image: req.image ? "[File]" : undefined }),
      extractImageMetadata
    );
  }

  generateModeration(req: ModerationsRequest): Promise<ModerationsResponse> {
    return this.withLifecycleGuard(
      req,
      () => this.telemetry.wrap(
        "moderations",
        () => ops.createModeration(this.client, { body: req }),
        () => req
      )
    );
  }

  generateVideo(req: VideoCreateRequest): Promise<VideoStatusResponse> {
    return this.withLifecycleGuard(
      req,
      () => this.telemetry.wrap(
        "video.generations",
        () => ops.createVideo(this.client, { body: req as unknown as VideoGenerationRequest }) as Promise<VideoStatusResponse>,
        () => req
      )
    );
  }

  getVideo(videoId: string): Promise<VideoStatusResponse> {
    return this.request("GET", `/videos/${encodeURIComponent(videoId)}`) as Promise<VideoStatusResponse>;
  }

  async getVideoContent(videoId: string): Promise<Uint8Array> {
    const url = new URL(`videos/${encodeURIComponent(videoId)}/content`, `${this.basePath}/`);
    const res = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed: ${res.status} ${res.statusText} - ${text}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  cancelVideo(videoId: string): Promise<VideoStatusResponse> {
    return this.request("POST", `/videos/${encodeURIComponent(videoId)}/cancel`) as Promise<VideoStatusResponse>;
  }

  getVideoDownloadUrl(
    videoId: string,
    body?: { ttl_seconds?: number; disposition?: "attachment" | "inline"; index?: number },
  ): Promise<{ download_url: string; expires_at: number }> {
    return this.request("POST", `/videos/${encodeURIComponent(videoId)}/download_url`, { body: body ?? {} }) as Promise<{ download_url: string; expires_at: number }>;
  }

  deleteVideo(videoId: string): Promise<{ id: string; object: "video"; deleted: boolean }> {
    return this.request("DELETE", `/videos/${encodeURIComponent(videoId)}`) as Promise<{ id: string; object: "video"; deleted: boolean }>;
  }

  listVideoModels(): Promise<VideoModelsResponse> {
    return this.request("GET", "/videos/models") as Promise<VideoModelsResponse>;
  }

  generateEmbedding(body: Record<string, unknown>): Promise<unknown> {
    return this.withLifecycleGuard(
      body,
      () => this.telemetry.wrap(
        "embeddings",
        () => ops.createEmbedding(this.client, { body: body as any }),
        () => body
      )
    );
  }

  generateResponse(req: ResponsesRequest): Promise<ResponsesResponse> {
    return this.withLifecycleGuard(
      req,
      () => this.telemetry.wrap(
        "responses",
        () => ops.createResponse(this.client, { body: req }),
        () => req,
        extractChatMetadata
      )
    );
  }

  async *streamResponse(req: ResponsesRequest): AsyncGenerator<string> {
    const payload = { ...req, stream: true };
    await this.maybeWarnForPayload(payload);

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

  createBatch(req: BatchRequest): Promise<BatchResponse> {
    return this.telemetry.wrap(
      "batches.create",
      () => ops.createBatch(this.client, { body: req }),
      () => req
    );
  }

  getBatch(batchId: string): Promise<BatchResponse> {
    return this.telemetry.wrap(
      "batches.retrieve",
      () => ops.retrieveBatch(this.client, { path: { batch_id: batchId } as any }),
      () => ({ batch_id: batchId })
    );
  }

  listFiles(): Promise<FileListResponse> {
    return this.telemetry.wrap(
      "files.list",
      () => ops.listFiles(this.client, {}),
      () => ({})
    );
  }

  getFile(fileId: string): Promise<FileObject> {
    return this.telemetry.wrap(
      "files.retrieve",
      () => ops.retrieveFile(this.client, { path: { file_id: fileId } as any }),
      () => ({ file_id: fileId })
    );
  }

  async uploadFile(params: { purpose?: string; file: Blob | File | BufferSource | string }): Promise<FileObject> {
    return this.telemetry.wrap(
      "files.upload",
      async () => {
        const form = new FormData();
        form.append("file", params.file as any);
        if (params.purpose) {
          form.append("purpose", params.purpose);
        }
        const res = await fetch(`${this.basePath}/files`, {
          method: "POST",
          headers: this.headers,
          body: form
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Request failed: ${res.status} ${res.statusText} - ${text}`);
        }
        return (await res.json()) as FileObject;
      },
      () => ({ purpose: params.purpose, file: "[File]" })
    );
  }

  getModels(params: Record<string, unknown> = {}): Promise<ModelListResponse> {
    return this.telemetry.wrap(
      "models.list",
      () => ops.listModels(this.client, { query: params as any }),
      () => params
    );
  }

  getHealth(): Promise<Healthz200Response> {
    return this.telemetry.wrap(
      "health",
      () => ops.healthz(this.client, {}),
      () => ({})
    );
  }

  getAnalytics(params: Record<string, unknown> = {}): Promise<unknown> {
    return this.telemetry.wrap(
      "analytics",
      () => ops.getActivity(this.client, { query: params as any }),
      () => params
    );
  }

  async generateSpeech(body: AudioSpeechRequest): Promise<Blob> {
    await this.maybeWarnForPayload(body);
    return this.telemetry.wrap(
      "audio.speech",
      async () => {
        const res = await fetch(`${this.basePath}/audio/speech`, {
          method: "POST",
          headers: { ...this.headers, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Request failed: ${res.status} ${res.statusText} - ${text}`);
        }
        return await res.blob();
      },
      () => body,
      (response) => ({
        usage: {
          audio_seconds: Math.round((response as Blob).size / 32000) // Estimate audio duration
        }
      })
    );
  }

  generateTranscription(body: AudioTranscriptionRequest | Record<string, unknown>): Promise<AudioTranscriptionResponse> {
    return this.withLifecycleGuard(
      body,
      () => this.telemetry.wrap(
        "audio.transcriptions",
        () => ops.createTranscription(this.client, { body: body as AudioTranscriptionRequest }),
        () => body
      )
    );
  }

  generateTranslation(body: AudioTranslationRequest | Record<string, unknown>): Promise<AudioTranslationResponse> {
    return this.withLifecycleGuard(
      body,
      () => this.telemetry.wrap(
        "audio.translations",
        () => ops.createTranslation(this.client, { body: body as AudioTranslationRequest }),
        () => body
      )
    );
  }

  async getGeneration(id: string): Promise<unknown> {
    return this.telemetry.wrap(
      "generations.retrieve",
      () => ops.getGeneration(this.client, { query: { id } as any }),
      () => ({ id })
    );
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

export default AIStats;

function resolveApiKey(explicit?: string): string {
  const key = explicit ?? readEnv("AI_STATS_API_KEY");
  if (!key) {
    throw new Error(
      "Missing API key. Pass `{ apiKey }` to `new AIStats(...)` or set `AI_STATS_API_KEY`.",
    );
  }
  return key;
}

function readEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process?.env) {
    return process.env[name];
  }
  return undefined;
}

function extractModelIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const direct =
    asTrimmedString(obj.model) ??
    asTrimmedString(obj.model_id);
  if (direct) return direct;

  const nestedCandidates = [
    obj.body,
    obj.payload,
    obj.request,
    obj.params
  ];
  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const nested = candidate as Record<string, unknown>;
    const nestedModelId =
      asTrimmedString(nested.model) ??
      asTrimmedString(nested.model_id);
    if (nestedModelId) return nestedModelId;
  }

  return null;
}

function toModelLifecycleInfo(
  model: DataModel & { lifecycle?: Record<string, unknown> | null },
  fallbackModelId: string
): ModelLifecycleInfo {
  const lifecycle = (model.lifecycle ?? {}) as Record<string, unknown>;
  const modelId = asTrimmedString(model.model_id) ?? fallbackModelId;
  const sourceStatus =
    asTrimmedString(model.status) ??
    asTrimmedString(lifecycle.status) ??
    null;

  const deprecationDate =
    asTrimmedString(lifecycle.deprecation_date) ??
    asTrimmedString(model.deprecation_date) ??
    null;
  const retirementDate =
    asTrimmedString(lifecycle.retirement_date) ??
    asTrimmedString(model.retirement_date) ??
    null;

  const status = normalizeLifecycleStatus(
    asTrimmedString(lifecycle.status) ?? asTrimmedString(model.status),
    deprecationDate,
    retirementDate
  );
  const replacementModelId = asTrimmedString(lifecycle.replacement_model_id) ?? null;
  const message =
    asTrimmedString(lifecycle.message) ??
    buildLifecycleMessage(status, modelId, deprecationDate, retirementDate, replacementModelId);

  return {
    modelId,
    status,
    sourceStatus,
    deprecationDate,
    retirementDate,
    replacementModelId,
    message,
  };
}

function normalizeLifecycleStatus(
  status: string | null,
  deprecationDate: string | null,
  retirementDate: string | null
): ModelLifecycleInfo["status"] {
  const now = Date.now();
  const retirementAt = parseDateMs(retirementDate);
  if (retirementAt !== null && retirementAt <= now) return "retired";

  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "retired") return "retired";

  const deprecatedAt = parseDateMs(deprecationDate);
  if (deprecatedAt !== null && deprecatedAt <= now) return "deprecated";
  if (normalized === "deprecated") return "deprecated";

  return "active";
}

function buildLifecycleMessage(
  status: ModelLifecycleInfo["status"],
  modelId: string,
  deprecationDate: string | null,
  retirementDate: string | null,
  replacementModelId: string | null
): string | null {
  const replacement = replacementModelId ? ` Use "${replacementModelId}" instead.` : "";
  if (status === "retired") {
    if (retirementDate) {
      return `[ai-stats] Model "${modelId}" is retired as of ${retirementDate}.${replacement}`;
    }
    return `[ai-stats] Model "${modelId}" is retired.${replacement}`;
  }
  if (status === "deprecated") {
    if (retirementDate) {
      return `[ai-stats] Model "${modelId}" is deprecated and scheduled for retirement on ${retirementDate}.${replacement}`;
    }
    if (deprecationDate) {
      return `[ai-stats] Model "${modelId}" has been deprecated since ${deprecationDate}.${replacement}`;
    }
    return `[ai-stats] Model "${modelId}" is deprecated.${replacement}`;
  }
  return null;
}

const ACTIVE_MODEL_SOURCE_STATUSES = new Set(["active", "available"]);
const INACTIVE_MODEL_SOURCE_STATUSES = new Set([
  "deprecated",
  "retired",
  "withheld",
  "announced",
  "rumoured",
  "rumored",
  "unavailable",
  "disabled",
  "internal",
  "private",
  "removed",
  "sunset",
  "eol",
  "end_of_life",
  "end-of-life",
]);

function normalizeSourceStatus(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isModelRequestableForInference(info: ModelLifecycleInfo): boolean {
  if (info.status !== "active") return false;
  const sourceStatus = normalizeSourceStatus(info.sourceStatus);
  if (!sourceStatus) return true;
  if (ACTIVE_MODEL_SOURCE_STATUSES.has(sourceStatus)) return true;
  if (INACTIVE_MODEL_SOURCE_STATUSES.has(sourceStatus)) return false;
  return false;
}

function buildInactiveModelRequestMessage(info: ModelLifecycleInfo): string {
  if (info.status !== "active") {
    return (
      info.message ??
      buildLifecycleMessage(
        info.status,
        info.modelId,
        info.deprecationDate,
        info.retirementDate,
        info.replacementModelId
      ) ??
      `[ai-stats] Model "${info.modelId}" is not active for inference.`
    );
  }

  const sourceStatus = normalizeSourceStatus(info.sourceStatus) ?? "unknown";
  const replacement = info.replacementModelId ? ` Use "${info.replacementModelId}" instead.` : "";
  return `[ai-stats] Model "${info.modelId}" is not active for inference (status: ${sourceStatus}).${replacement}`;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function parseDateMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

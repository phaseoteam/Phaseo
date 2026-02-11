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
export type Healthz200Response = Awaited<ReturnType<typeof ops.healthz>>;

export class AIStats {
  private readonly client: Client;
  private readonly basePath: string;
  private readonly headers: Record<string, string>;
  private readonly telemetry: TelemetryCapture;

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
    return this.telemetry.wrap(
      "images.generations",
      () => ops.createImage(this.client, { body: req }),
      () => req,
      extractImageMetadata
    );
  }

  async generateImageEdit(req: ImagesEditRequest): Promise<ImagesEditResponse> {
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
    return this.telemetry.wrap(
      "moderations",
      () => ops.createModeration(this.client, { body: req }),
      () => req
    );
  }

  generateVideo(req: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    return this.telemetry.wrap(
      "video.generations",
      () => ops.createVideo(this.client, { body: req }),
      () => req
    );
  }

  generateEmbedding(body: Record<string, unknown>): Promise<unknown> {
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
      () => ops.getAnalytics(this.client, { query: params as any }),
      () => params
    );
  }

  async generateSpeech(body: AudioSpeechRequest): Promise<Blob> {
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
    return this.telemetry.wrap(
      "audio.transcriptions",
      () => ops.createTranscription(this.client, { body: body as AudioTranscriptionRequest }),
      () => body
    );
  }

  generateTranslation(body: AudioTranslationRequest | Record<string, unknown>): Promise<AudioTranslationResponse> {
    return this.telemetry.wrap(
      "audio.translations",
      () => ops.createTranslation(this.client, { body: body as AudioTranslationRequest }),
      () => body
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

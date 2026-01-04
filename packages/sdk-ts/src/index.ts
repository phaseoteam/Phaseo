import type {
  AudioSpeechRequest,
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
} from "./gen/models/index.js";
import * as ops from "./gen/client/default.js";
import { Client } from "./runtime/client.js";

export type ModelIdLiteral = ModelId;
export const MODEL_IDS: ModelIdLiteral[] = [];
export const MODEL_ID_SET = new Set<ModelIdLiteral>(MODEL_IDS);

type Options = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
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

const DEFAULT_BASE_URL = "https://api.ai-stats.phaseo.app/v1";

export type {
  AudioSpeechRequest,
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

  constructor(private readonly opts: Options) {
    this.basePath = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.headers = { Authorization: `Bearer ${opts.apiKey}` };
    this.client = new Client({
      baseUrl: this.basePath,
      headers: this.headers,
      timeoutMs: opts.timeoutMs,
      fetchImpl: opts.fetchImpl
    });
  }

  async generateText(req: ChatCompletionsParams): Promise<ChatCompletionsResponse> {
    const payload = { ...req, stream: false, messages: req.messages.map(normalizeMessage) };
    return ops.createChatCompletion(this.client, { body: payload });
  }

  async *streamText(req: ChatCompletionsParams): AsyncGenerator<string> {
    const payload = { ...req, stream: true, messages: req.messages.map(normalizeMessage) };
    const body = JSON.stringify(payload);
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
  }

  generateImage(req: ImagesGenerationRequest): Promise<ImagesGenerationResponse> {
    return ops.createImage(this.client, { body: req });
  }

  async generateImageEdit(req: ImagesEditRequest): Promise<ImagesEditResponse> {
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
  }

  generateModeration(req: ModerationsRequest): Promise<ModerationsResponse> {
    return ops.createModeration(this.client, { body: req });
  }

  generateVideo(req: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    return ops.createVideo(this.client, { body: req });
  }

  generateEmbedding(body: Record<string, unknown>): Promise<unknown> {
    return ops.createEmbedding(this.client, { body: body as any });
  }

  generateResponse(req: ResponsesRequest): Promise<ResponsesResponse> {
    return ops.createResponse(this.client, { body: req });
  }

  async *streamResponse(req: ResponsesRequest): AsyncGenerator<string> {
    const payload = { ...req, stream: true };
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
  }

  createBatch(req: BatchRequest): Promise<BatchResponse> {
    return ops.createBatch(this.client, { body: req });
  }

  getBatch(batchId: string): Promise<BatchResponse> {
    return ops.retrieveBatch(this.client, { path: { batch_id: batchId } as any });
  }

  listFiles(): Promise<FileListResponse> {
    return ops.listFiles(this.client, {});
  }

  getFile(fileId: string): Promise<FileObject> {
    return ops.retrieveFile(this.client, { path: { file_id: fileId } as any });
  }

  async uploadFile(params: { purpose?: string; file: Blob | File | BufferSource | string }): Promise<FileObject> {
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
  }

  getModels(params: Record<string, unknown> = {}): Promise<ModelListResponse> {
    return ops.listModels(this.client, { query: params as any });
  }

  getHealth(): Promise<Healthz200Response> {
    return ops.healthz(this.client, {});
  }

  getAnalytics(params: Record<string, unknown> = {}): Promise<unknown> {
    return ops.getAnalytics(this.client, { query: params as any });
  }

  async generateSpeech(body: AudioSpeechRequest): Promise<Blob> {
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
  }

  async generateTranscription(body: Record<string, unknown>): Promise<AudioTranscriptionResponse> {
    const form = new FormData();
    Object.entries(body).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.append(key, value as string | Blob);
      }
    });
    const res = await fetch(`${this.basePath}/audio/transcriptions`, {
      method: "POST",
      headers: this.headers,
      body: form
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed: ${res.status} ${res.statusText} - ${text}`);
    }
    return (await res.json()) as AudioTranscriptionResponse;
  }

  async generateTranslation(body: AudioTranslationRequest): Promise<AudioTranslationResponse> {
    const form = new FormData();
    Object.entries(body).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.append(key, value as string | Blob);
      }
    });
    const res = await fetch(`${this.basePath}/audio/translations`, {
      method: "POST",
      headers: this.headers,
      body: form
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed: ${res.status} ${res.statusText} - ${text}`);
    }
    return (await res.json()) as AudioTranslationResponse;
  }

  async getGeneration(id: string): Promise<unknown> {
    return ops.getGeneration(this.client, { query: { id } as any });
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

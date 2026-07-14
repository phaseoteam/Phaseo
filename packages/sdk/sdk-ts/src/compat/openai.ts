/**
 * OpenAI SDK Compatibility Layer
 * Drop-in replacement for 'openai' package
 *
 * Usage:
 *   import { OpenAI } from '@phaseo/sdk/compat/openai';
 *   const openai = new OpenAI({ apiKey: '...' });
 *   const completion = await openai.chat.completions.create({...});
 */

import { Phaseo } from "../index.js";
import type {
  ChatCompletionsRequest,
  ChatCompletionsResponse,
  ImagesGenerationRequest,
  ImagesGenerationResponse,
  AudioSpeechRequest,
  ModerationsRequest,
  ModerationsResponse,
  FileResponse,
  BatchRequest,
  BatchResponse
} from "../oapi-gen/models/index.js";

type OpenAIConfig = {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  dangerouslyAllowBrowser?: boolean;
  defaultHeaders?: Record<string, string>;
  defaultQuery?: Record<string, string>;
};

type ChatCompletionCreateParams = Omit<ChatCompletionsRequest, 'stream'> & {
  stream?: boolean | null;
};

type ChatCompletionCreateParamsStreaming = ChatCompletionCreateParams & {
  stream: true;
};

type ChatCompletionCreateParamsNonStreaming = ChatCompletionCreateParams & {
  stream?: false | null;
};

type ImageGenerateParams = ImagesGenerationRequest;
type AudioSpeechCreateParams = AudioSpeechRequest;
type ModerationCreateParams = ModerationsRequest;

/**
 * OpenAI SDK-compatible client
 * Mimics the official OpenAI SDK interface
 */
export class OpenAI {
  private readonly phaseo: Phaseo;

  // Nested resource accessors (matching OpenAI SDK structure)
  public readonly chat: {
    completions: {
      create(params: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletionsResponse>;
      create(params: ChatCompletionCreateParamsStreaming): AsyncIterable<string>;
      create(params: ChatCompletionCreateParams): Promise<ChatCompletionsResponse> | AsyncIterable<string>;
    };
  };

  public readonly images: {
    generate(params: ImageGenerateParams): Promise<ImagesGenerationResponse>;
  };

  public readonly audio: {
    speech: {
      create(params: AudioSpeechCreateParams): Promise<Blob>;
    };
    transcriptions: {
      create(params: Record<string, unknown>): Promise<unknown>;
    };
    translations: {
      create(params: Record<string, unknown>): Promise<unknown>;
    };
  };

  public readonly moderations: {
    create(params: ModerationCreateParams): Promise<ModerationsResponse>;
  };

  public readonly models: {
    list(params?: Record<string, unknown>): Promise<unknown>;
  };

  public readonly files: {
    create(params: { purpose?: string; file: Blob | File | BufferSource | string }): Promise<FileResponse>;
    retrieve(fileId: string): Promise<FileResponse>;
    list(): Promise<unknown>;
    del(fileId: string): Promise<unknown>;
  };

  public readonly batches: {
    create(params: BatchRequest): Promise<BatchResponse>;
    list(params?: Record<string, unknown>): Promise<unknown>;
    retrieve(batchId: string): Promise<BatchResponse>;
    cancel(batchId: string): Promise<BatchResponse>;
    listModels(params?: Record<string, unknown>): Promise<unknown>;
  };

  constructor(config: OpenAIConfig) {
    // Map OpenAI config to Phaseo config
    this.phaseo = new Phaseo({
      apiKey: config.apiKey,
      baseUrl: config.baseURL,
      timeoutMs: config.timeout
    });

    // Chat completions
    this.chat = {
      completions: {
        create: ((params: ChatCompletionCreateParams) => {
          if (params.stream) {
            return this.phaseo.streamText(params as any);
          }
          return this.phaseo.generateText(params as any);
        }) as any
      }
    };

    // Images
    this.images = {
      generate: (params) => this.phaseo.generateImage(params)
    };

    // Audio
    this.audio = {
      speech: {
        create: (params) => this.phaseo.generateSpeech(params)
      },
      transcriptions: {
        create: (params) => this.phaseo.generateTranscription(params)
      },
      translations: {
        create: (params) => this.phaseo.generateTranslation(params as any)
      }
    };

    // Moderations
    this.moderations = {
      create: (params) => this.phaseo.generateModeration(params)
    };

    // Models
    this.models = {
      list: (params) => this.phaseo.getModels(params)
    };

    // Files
    this.files = {
      create: (params) => this.phaseo.uploadFile(params),
      retrieve: (fileId) => this.phaseo.getFile(fileId),
      list: () => this.phaseo.listFiles(),
      del: () => Promise.reject(new Error('File deletion not implemented'))
    };

    // Batches
    this.batches = {
      create: (params) => this.phaseo.createBatch(params),
      list: (params) => this.phaseo.listBatches(params),
      retrieve: (batchId) => this.phaseo.getBatch(batchId),
      cancel: (batchId) => this.phaseo.cancelBatch(batchId),
      listModels: (params) => this.phaseo.listBatchModels(params)
    };
  }

  /**
   * Direct access to underlying Phaseo client
   * For features not available in OpenAI SDK
   */
  get native(): Phaseo {
    return this.phaseo;
  }
}

/**
 * Re-export types for convenience
 */
export type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionCreateParamsNonStreaming,
  ImageGenerateParams,
  AudioSpeechCreateParams,
  ModerationCreateParams
};

/**
 * Default export for ESM compatibility
 */
export default OpenAI;

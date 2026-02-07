/**
 * OpenAI SDK Compatibility Layer
 * Drop-in replacement for 'openai' package
 *
 * Usage:
 *   import { OpenAI } from '@ai-stats/sdk/compat/openai';
 *   const openai = new OpenAI({ apiKey: '...' });
 *   const completion = await openai.chat.completions.create({...});
 */

import { AIStats } from "../index.js";
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
  private readonly aiStats: AIStats;

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
    retrieve(batchId: string): Promise<BatchResponse>;
  };

  constructor(config: OpenAIConfig) {
    // Map OpenAI config to AIStats config
    this.aiStats = new AIStats({
      apiKey: config.apiKey,
      baseUrl: config.baseURL,
      timeoutMs: config.timeout
    });

    // Chat completions
    this.chat = {
      completions: {
        create: ((params: ChatCompletionCreateParams) => {
          if (params.stream) {
            return this.aiStats.streamText(params as any);
          }
          return this.aiStats.generateText(params as any);
        }) as any
      }
    };

    // Images
    this.images = {
      generate: (params) => this.aiStats.generateImage(params)
    };

    // Audio
    this.audio = {
      speech: {
        create: (params) => this.aiStats.generateSpeech(params)
      },
      transcriptions: {
        create: (params) => this.aiStats.generateTranscription(params)
      },
      translations: {
        create: (params) => this.aiStats.generateTranslation(params as any)
      }
    };

    // Moderations
    this.moderations = {
      create: (params) => this.aiStats.generateModeration(params)
    };

    // Models
    this.models = {
      list: (params) => this.aiStats.getModels(params)
    };

    // Files
    this.files = {
      create: (params) => this.aiStats.uploadFile(params),
      retrieve: (fileId) => this.aiStats.getFile(fileId),
      list: () => this.aiStats.listFiles(),
      del: () => Promise.reject(new Error('File deletion not implemented'))
    };

    // Batches
    this.batches = {
      create: (params) => this.aiStats.createBatch(params),
      retrieve: (batchId) => this.aiStats.getBatch(batchId)
    };
  }

  /**
   * Direct access to underlying AIStats client
   * For features not available in OpenAI SDK
   */
  get native(): AIStats {
    return this.aiStats;
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

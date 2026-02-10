import type {
  TranscriptionModelV3,
  TranscriptionModelV3CallOptions,
} from '@ai-sdk/provider';
import type { AIStatsConfig, AIStatsModelSettings } from './ai-stats-settings.js';
import { createAIStatsErrorHandler } from './utils/error-handler.js';

/**
 * AI Stats Transcription Model implementation for Vercel AI SDK v1
 * Supports audio transcription via /v1/audio/transcriptions
 */
export class AIStatsTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'ai-stats' as const;
  readonly modelId: string;

  private readonly config: AIStatsConfig;
  private readonly settings: AIStatsModelSettings;

  constructor(
    modelId: string,
    config: AIStatsConfig,
    settings: AIStatsModelSettings = {}
  ) {
    this.modelId = modelId;
    this.config = config;
    this.settings = settings;
  }

  /**
   * Transcribe audio to text
   */
  async doGenerate(options: TranscriptionModelV3CallOptions) {
    const { audio, mediaType, abortSignal, providerOptions, headers } = options;

    // Build FormData for multipart upload
    const formData = new FormData();

    // Add audio file
    // audio can be a string (base64) or Uint8Array
    const audioBlob = typeof audio === 'string'
      ? new Blob([Buffer.from(audio, 'base64')], { type: mediaType })
      : new Blob([audio as any], { type: mediaType });

    formData.append('file', audioBlob, 'audio.' + (mediaType.split('/')[1] || 'wav'));
    formData.append('model', this.modelId);

    // Add optional parameters from settings
    if (this.settings.user) {
      formData.append('user', this.settings.user);
    }

    // Add provider-specific options
    if (providerOptions) {
      for (const providerSettings of Object.values(providerOptions)) {
        for (const [key, value] of Object.entries(providerSettings)) {
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        }
      }
    }

    // Make the API request
    const url = `${this.config.baseURL}/audio/transcriptions`;
    const fetchImpl = this.config.fetch ?? fetch;

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
        ...headers,
        // Don't set Content-Type - let browser/fetch set it with boundary for multipart
      },
      body: formData,
      signal: abortSignal,
    });

    // Handle errors
    if (!response.ok) {
      const errorHandler = createAIStatsErrorHandler();
      throw (await errorHandler({ url, requestBodyValues: { model: this.modelId }, response })).value;
    }

    // Parse response
    const data = await response.json();

    return {
      text: data.text,
      segments: data.segments?.map((segment: any) => ({
        text: segment.text,
        startSecond: segment.start,
        endSecond: segment.end,
      })) || [],
      language: data.language,
      durationInSeconds: data.duration,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries(Array.from(response.headers as any) as [string, string][]),
        body: data,
      },
    };
  }
}

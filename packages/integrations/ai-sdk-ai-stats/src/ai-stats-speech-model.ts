import type { SpeechModelV3, SpeechModelV3CallOptions } from '@ai-sdk/provider';
import type { AIStatsConfig, AIStatsModelSettings } from './ai-stats-settings.js';
import { createAIStatsErrorHandler } from './utils/error-handler.js';

/**
 * AI Stats Speech Model implementation for Vercel AI SDK v1
 * Supports text-to-speech via /v1/audio/speech
 */
export class AIStatsSpeechModel implements SpeechModelV3 {
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
   * Generate speech from text
   */
  async doGenerate(options: SpeechModelV3CallOptions) {
    const { text, abortSignal, voice, speed, outputFormat, providerOptions, headers, instructions } = options;

    // Build request payload
    const payload: any = {
      model: this.modelId,
      input: text,
    };

    // Add optional parameters
    if (voice) {
      payload.voice = voice;
    }
    if (speed !== undefined) {
      payload.speed = speed;
    }
    if (outputFormat) {
      // Map AI SDK format to gateway format
      payload.response_format = outputFormat;
    }
    if (instructions) {
      payload.instructions = instructions;
    }
    if (this.settings.user) {
      payload.user = this.settings.user;
    }

    // Add provider-specific options
    if (providerOptions) {
      for (const providerSettings of Object.values(providerOptions)) {
        Object.assign(payload, providerSettings);
      }
    }

    // Make the API request
    const url = `${this.config.baseURL}/audio/speech`;
    const fetchImpl = this.config.fetch ?? fetch;

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
        ...headers,
      },
      body: JSON.stringify(payload),
      signal: abortSignal,
    });

    // Handle errors
    if (!response.ok) {
      const errorHandler = createAIStatsErrorHandler();
      throw (await errorHandler({ url, requestBodyValues: payload, response })).value;
    }

    // Get audio data as ArrayBuffer
    const audioData = await response.arrayBuffer();

    return {
      audio: new Uint8Array(audioData),
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries(Array.from(response.headers as any) as [string, string][]),
      },
    };
  }
}

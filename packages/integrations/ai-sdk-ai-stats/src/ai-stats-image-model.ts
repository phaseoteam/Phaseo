import type { ImageModelV3, ImageModelV3CallOptions } from '@ai-sdk/provider';
import type { AIStatsConfig, AIStatsModelSettings } from './ai-stats-settings.js';
import { createAIStatsErrorHandler } from './utils/error-handler.js';

/**
 * AI Stats Image Model implementation for Vercel AI SDK v1
 * Supports image generation via /v1/images/generations
 */
export class AIStatsImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'ai-stats' as const;
  readonly modelId: string;
  readonly maxImagesPerCall: number | undefined = 10;

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
   * Generate images from a text prompt
   */
  async doGenerate(options: ImageModelV3CallOptions) {
    const { prompt, n, size, abortSignal, aspectRatio, providerOptions, headers } = options;

    // Build request payload
    const payload: Record<string, unknown> = {
      model: this.modelId,
      n: n ?? 1,
    };

    if (prompt) {
      payload.prompt = prompt;
    }

    // Handle size or aspect ratio
    if (size) {
      payload.size = size;
    } else if (aspectRatio) {
      // Convert aspect ratio to size if possible
      const aspectRatioToSize: Record<string, string> = {
        '1:1': '1024x1024',
        '16:9': '1792x1024',
        '9:16': '1024x1792',
      };
      payload.size = aspectRatioToSize[aspectRatio] || '1024x1024';
    }

    // Add provider-specific options
    if (providerOptions) {
      for (const providerConfig of Object.values(providerOptions)) {
        Object.assign(payload, providerConfig);
      }
    }

    // Add user if provided
    if (this.settings.user) {
      payload.user = this.settings.user;
    }

    // Make the API request
    const url = `${this.config.baseURL}/images/generations`;
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

    // Parse response
    const data = await response.json();

    // Extract images - return as base64 strings or keep as is
    const images: Array<string> = data.data.map((item: any) => {
      // If b64_json is present, return it directly
      if (item.b64_json) {
        return item.b64_json;
      }
      // If URL is present, return it (though this isn't typical for the interface)
      if (item.url) {
        return item.url;
      }
      throw new Error('Image response missing url or b64_json');
    });

    return {
      images,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: Object.fromEntries(Array.from(response.headers as any) as [string, string][]),
      },
    };
  }
}

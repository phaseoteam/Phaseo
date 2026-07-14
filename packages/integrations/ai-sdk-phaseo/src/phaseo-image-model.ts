import type { ImageModelV3, ImageModelV3CallOptions } from '@ai-sdk/provider';
import type { PhaseoConfig, PhaseoModelSettings } from './phaseo-settings.js';
import { mapPhaseoProviderMetadata } from './map-phaseo-provider-metadata.js';
import { createPhaseoErrorHandler } from './utils/error-handler.js';

/**
 * Phaseo Image Model implementation for Vercel AI SDK v1
 * Supports image generation via /v1/images/generations
 */
export class PhaseoImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'phaseo' as const;
  readonly modelId: string;
  readonly maxImagesPerCall: number | undefined = 10;

  private readonly config: PhaseoConfig;
  private readonly settings: PhaseoModelSettings;

  constructor(
    modelId: string,
    config: PhaseoConfig,
    settings: PhaseoModelSettings = {}
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
      const errorHandler = createPhaseoErrorHandler();
      throw (await errorHandler({ url, requestBodyValues: payload, response })).value;
    }

    // Parse response
    const data = await response.json();
    const responseHeaders = Object.fromEntries(
      Array.from(response.headers as any) as [string, string][]
    );
    const phaseoMetadata = mapPhaseoProviderMetadata(data, responseHeaders)?.['phaseo'];

    const images = await Promise.all(
      data.data.map(async (item: any): Promise<string | Uint8Array> => {
        if (item.b64_json) {
          return item.b64_json;
        }

        if (item.url) {
          const imageResponse = await fetchImpl(item.url, {
            method: 'GET',
            signal: abortSignal,
          });

          if (!imageResponse.ok) {
            throw new Error(`Image download failed with status ${imageResponse.status}`);
          }

          return new Uint8Array(await imageResponse.arrayBuffer());
        }

        throw new Error('Image response missing url or b64_json');
      })
    );

    return {
      images,
      warnings: [],
      providerMetadata: phaseoMetadata
        ? {
            gateway: {
              images: [],
              ...phaseoMetadata,
            },
          }
        : undefined,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

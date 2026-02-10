import type {
  EmbeddingModelV3,
  EmbeddingModelV3CallOptions,
  EmbeddingModelV3Result,
} from '@ai-sdk/provider';
import type { AIStatsConfig, AIStatsModelSettings } from './ai-stats-settings.js';
import { createAIStatsErrorHandler } from './utils/error-handler.js';

/**
 * AI Stats Embedding Model implementation for Vercel AI SDK v6
 */
export class AIStatsEmbeddingModel implements EmbeddingModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'ai-stats' as const;
  readonly modelId: string;
  readonly maxEmbeddingsPerCall = 2048;
  readonly supportsParallelCalls = true;

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
   * Generate embeddings for the provided values
   */
  async doEmbed(options: EmbeddingModelV3CallOptions): Promise<EmbeddingModelV3Result> {
    const { values, abortSignal, headers, providerOptions } = options;

    // Build request payload
    const payload: Record<string, unknown> = {
      model: this.modelId,
      input: values,
      encoding_format: 'float', // Request full precision
      ...(this.settings.user && { user: this.settings.user }),
    };

    if (providerOptions) {
      for (const providerConfig of Object.values(providerOptions)) {
        Object.assign(payload, providerConfig);
      }
    }

    // Make the API request
    const url = `${this.config.baseURL}/embeddings`;
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

    // Extract embeddings in order
    const embeddings = data.data
      .sort((a: any, b: any) => a.index - b.index)
      .map((item: any) => item.embedding);

    // Extract usage
    const usage = data.usage
      ? {
          tokens: data.usage.total_tokens ?? 0,
        }
      : undefined;

    return {
      embeddings,
      usage,
      response: {
        headers: Object.fromEntries(Array.from(response.headers as any) as [string, string][]),
      },
      warnings: [],
    };
  }
}

import type {
  LanguageModelV3,
  ProviderV3,
  EmbeddingModelV3,
  ImageModelV3,
  TranscriptionModelV3,
  SpeechModelV3,
} from '@ai-sdk/provider';
import { AIStatsLanguageModel } from './ai-stats-language-model.js';
import { AIStatsEmbeddingModel } from './ai-stats-embedding-model.js';
import { AIStatsImageModel } from './ai-stats-image-model.js';
import { AIStatsTranscriptionModel } from './ai-stats-transcription-model.js';
import { AIStatsSpeechModel } from './ai-stats-speech-model.js';
import type { AIStatsSettings, AIStatsModelSettings } from './ai-stats-settings.js';

/**
 * Default base URL for the AI Stats Gateway API
 */
const DEFAULT_BASE_URL = 'https://api.phaseo.app/v1';

/**
 * Creates an AI Stats provider instance for use with Vercel AI SDK.
 *
 * @param settings - Configuration settings for the provider
 * @returns A provider function that creates language model instances
 *
 * @example
 * ```typescript
 * import { createAIStats } from '@ai-stats/ai-sdk-provider';
 * import { generateText } from 'ai';
 *
 * const aiStats = createAIStats({
 *   apiKey: process.env.AI_STATS_API_KEY,
 * });
 *
 * const result = await generateText({
 *   model: aiStats('openai/gpt-4o'),
 *   prompt: 'Hello, world!',
 * });
 * ```
 */
type AIStatsProvider = ProviderV3 & ((
  modelId: string,
  modelSettings?: AIStatsModelSettings
) => LanguageModelV3);

export function createAIStats(settings: AIStatsSettings = {}): AIStatsProvider {
  // Resolve API key from settings or environment variable
  const apiKey = settings.apiKey ?? process.env.AI_STATS_API_KEY;

  if (!apiKey) {
    throw new Error(
      'AI Stats API key is required. ' +
      'Provide it via the apiKey option or set the AI_STATS_API_KEY environment variable.'
    );
  }

  // Resolve base URL with default
  const baseURL = settings.baseURL ?? DEFAULT_BASE_URL;

  // Create the provider function that returns language model instances
  const provider = ((
    modelId: string,
    modelSettings?: AIStatsModelSettings
  ): LanguageModelV3 => {
    return new AIStatsLanguageModel(
      modelId,
      {
        apiKey,
        baseURL,
        headers: settings.headers,
        fetch: settings.fetch,
      },
      modelSettings
    );
  }) as AIStatsProvider;

  Object.defineProperty(provider, 'specificationVersion', {
    value: 'v3',
  });

  // Set the provider ID for debugging
  provider.languageModel = (modelId: string) => {
    return provider(modelId);
  };

  provider.embeddingModel = (
    modelId: string,
    modelSettings?: AIStatsModelSettings
  ): EmbeddingModelV3 => {
    return new AIStatsEmbeddingModel(
      modelId,
      {
        apiKey,
        baseURL,
        headers: settings.headers,
        fetch: settings.fetch,
      },
      modelSettings
    );
  };

  provider.textEmbeddingModel = (modelId: string): EmbeddingModelV3 =>
    provider.embeddingModel(modelId);

  provider.imageModel = (
    modelId: string,
    modelSettings?: AIStatsModelSettings
  ): ImageModelV3 => {
    return new AIStatsImageModel(
      modelId,
      {
        apiKey,
        baseURL,
        headers: settings.headers,
        fetch: settings.fetch,
      },
      modelSettings
    );
  };

  provider.transcriptionModel = (
    modelId: string,
    modelSettings?: AIStatsModelSettings
  ): TranscriptionModelV3 => {
    return new AIStatsTranscriptionModel(
      modelId,
      {
        apiKey,
        baseURL,
        headers: settings.headers,
        fetch: settings.fetch,
      },
      modelSettings
    );
  };

  provider.speechModel = (
    modelId: string,
    modelSettings?: AIStatsModelSettings
  ): SpeechModelV3 => {
    return new AIStatsSpeechModel(
      modelId,
      {
        apiKey,
        baseURL,
        headers: settings.headers,
        fetch: settings.fetch,
      },
      modelSettings
    );
  };

  provider.rerankingModel = () => {
    throw new Error('Reranking models are not supported by this provider.');
  };

  return provider;
}
